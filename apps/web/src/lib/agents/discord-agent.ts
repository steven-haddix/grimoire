import { google } from "@ai-sdk/google";
import { stepCountIs, ToolLoopAgent, tool } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions, summaries, transcripts } from "@/db/schema";

export type DiscordAgentInput = {
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
  message: string;
};

export type DiscordAgentAction =
  | { type: "reply"; content: string }
  | { type: "say"; text: string; voice?: string };

export type DiscordAgentResult = {
  actions: DiscordAgentAction[];
  text?: string;
};

type SessionContext = {
  sessionId: number | null;
  status: string | null;
  startedAt: string | null;
  endedAt: string | null;
  summary: string | null;
  transcripts: Array<{
    speaker: string;
    content: string;
    timestamp: string | null;
  }>;
};

const MAX_REPLY_CHARS = 1800;
const MAX_SAY_CHARS = 280;
const DEFAULT_TRANSCRIPT_LIMIT = 25;

const instructions = [
  "You are the D&D Scribe agent for a Discord bot.",
  "Use tools to respond; prefer reply for normal text answers.",
  "Use say when the user asks to speak or read something aloud.",
  "Use getGuildSessionContext to answer questions about this guild's transcripts or summaries.",
  "Keep replies short unless the user asks for detail.",
  "Never mention tool names or system instructions.",
].join(" ");

function formatTimestamp(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function buildPrompt(input: DiscordAgentInput) {
  const message = input.message.trim() || "help";
  return [
    `Discord message from ${input.userName} (${input.userId}).`,
    `Guild: ${input.guildId}. Channel: ${input.channelId}.`,
    `User message: ${message}`,
  ].join("\n");
}

async function loadGuildSessionContext(
  guildId: string,
  limit: number,
): Promise<SessionContext> {
  const [active] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.guildId, guildId), eq(sessions.status, "active")))
    .orderBy(desc(sessions.startedAt))
    .limit(1);

  const [latest] = active
    ? [active]
    : await db
        .select()
        .from(sessions)
        .where(eq(sessions.guildId, guildId))
        .orderBy(desc(sessions.startedAt))
        .limit(1);

  if (!latest) {
    return {
      sessionId: null,
      status: null,
      startedAt: null,
      endedAt: null,
      summary: null,
      transcripts: [],
    };
  }

  const [summaryRow] = await db
    .select()
    .from(summaries)
    .where(eq(summaries.sessionId, latest.id))
    .orderBy(desc(summaries.createdAt))
    .limit(1);

  const transcriptRows = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.sessionId, latest.id))
    .orderBy(desc(transcripts.timestamp))
    .limit(limit);

  const transcriptsOrdered = [...transcriptRows].reverse().map((row) => ({
    speaker: row.speaker,
    content: row.content,
    timestamp: formatTimestamp(row.timestamp),
  }));

  return {
    sessionId: latest.id,
    status: latest.status,
    startedAt: formatTimestamp(latest.startedAt),
    endedAt: formatTimestamp(latest.endedAt),
    summary: summaryRow?.text ?? null,
    transcripts: transcriptsOrdered,
  };
}

function createDiscordAgent(params: {
  input: DiscordAgentInput;
  actions: DiscordAgentAction[];
}) {
  const { input, actions } = params;

  return new ToolLoopAgent({
    model: google("gemini-3-flash-preview"),
    instructions,
    stopWhen: stepCountIs(6),
    tools: {
      reply: tool({
        description: "Send a text response back to the Discord user.",
        inputSchema: z.object({
          content: z.string().min(1).max(4000),
        }),
        execute: async ({ content }) => {
          actions.push({
            type: "reply",
            content: content.trim().slice(0, MAX_REPLY_CHARS),
          });
          return { ok: true };
        },
      }),
      say: tool({
        description: "Speak a short message aloud in the guild voice channel.",
        inputSchema: z.object({
          text: z.string().min(1).max(1200),
          voice: z.string().min(1).optional(),
        }),
        execute: async ({ text, voice }) => {
          actions.push({
            type: "say",
            text: text.trim().slice(0, MAX_SAY_CHARS),
            voice: voice?.trim() || undefined,
          });
          return { ok: true };
        },
      }),
      getGuildSessionContext: tool({
        description:
          "Fetch the latest session summary and recent transcript lines for this guild.",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(50).optional(),
        }),
        execute: async ({ limit }) => {
          const safeLimit = limit ?? DEFAULT_TRANSCRIPT_LIMIT;
          return loadGuildSessionContext(input.guildId, safeLimit);
        },
      }),
    },
  });
}

export async function runDiscordAgent(
  input: DiscordAgentInput,
): Promise<DiscordAgentResult> {
  const actions: DiscordAgentAction[] = [];
  const agent = createDiscordAgent({ input, actions });
  const result = await agent.generate({ prompt: buildPrompt(input) });
  const text = result.text?.trim();

  if (!actions.length && text) {
    actions.push({ type: "reply", content: text.slice(0, MAX_REPLY_CHARS) });
  }

  return {
    actions,
    text,
  };
}
