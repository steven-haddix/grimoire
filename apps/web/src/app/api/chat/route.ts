import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { webChatMessages } from "@/db/schema";
import { createWebChatAgent } from "@/lib/agents/web-chat-agent";
import {
  extractMessageText,
  WEB_CHAT_CONTEXT_LIMIT,
  WEB_CHAT_INPUT_MAX_CHARS,
} from "@/lib/agents/web-chat-messages";
import {
  CampaignAccessError,
  requireCampaignAccess,
} from "@/lib/auth/campaign-access";

/**
 * Streaming chat endpoint for the web "Ask Grimoire" page. Authenticated as a
 * user route (better-auth session + guild-admin campaign check) — not the
 * x-bot-secret scheme the bot routes use.
 */
export async function POST(req: Request) {
  let body: {
    campaignId?: unknown;
    messages?: unknown;
    trigger?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const campaignId = Number(body.campaignId);
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  let userId: string;
  try {
    ({ userId } = await requireCampaignAccess(campaignId));
  } catch (error) {
    if (error instanceof CampaignAccessError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }

  const uiMessages = body.messages.slice(
    -WEB_CHAT_CONTEXT_LIMIT,
  ) as UIMessage[];

  // Persist the incoming user message (not on regenerate, which re-sends a
  // message that is already stored). Best-effort — a failed write never
  // blocks the answer.
  const lastMessage = uiMessages[uiMessages.length - 1];
  const userText =
    lastMessage?.role === "user" ? extractMessageText(lastMessage) : "";
  if (userText.length > WEB_CHAT_INPUT_MAX_CHARS) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }
  if (userText && body.trigger !== "regenerate-message") {
    try {
      await db.insert(webChatMessages).values({
        campaignId,
        userId,
        role: "user",
        content: userText,
      });
    } catch (error) {
      console.error("Failed to persist web chat user message", error);
    }
  }

  const agent = createWebChatAgent({ campaignId, userId });

  return createAgentUIStreamResponse({
    agent,
    uiMessages,
    onEnd: async ({ responseMessage }) => {
      const text = extractMessageText(responseMessage);
      if (!text) return;
      try {
        await db.insert(webChatMessages).values({
          campaignId,
          userId,
          role: "assistant",
          content: text,
        });
      } catch (error) {
        console.error("Failed to persist web chat reply", error);
      }
    },
    onError: (error) => {
      console.error("Web chat stream error", error);
      return "The pages flutter uselessly — something interrupted my recollection. Ask again.";
    },
  });
}
