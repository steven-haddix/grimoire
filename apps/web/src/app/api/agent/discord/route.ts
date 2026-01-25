import { NextResponse } from "next/server";
import { runDiscordAgent, type DiscordAgentInput } from "@/lib/agents/discord-agent";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDiscordAgentPayload(value: unknown): DiscordAgentInput | null {
  if (!isRecord(value)) return null;

  const guildId = typeof value.guildId === "string" ? value.guildId.trim() : "";
  const channelId =
    typeof value.channelId === "string" ? value.channelId.trim() : "";
  const userId = typeof value.userId === "string" ? value.userId.trim() : "";
  const userName =
    typeof value.userName === "string" ? value.userName.trim() : "";
  const userDisplayName =
    typeof value.userDisplayName === "string" ? value.userDisplayName.trim() : "";
  const message = typeof value.message === "string" ? value.message.trim() : "";

  if (!guildId || !channelId || !userId || !userName) return null;

  return {
    guildId,
    channelId,
    userId,
    userName,
    userDisplayName,
    message,
  };
}

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = parseDiscordAgentPayload(await req.json().catch(() => null));

  if (!payload) {
    return NextResponse.json({ error: "Missing agent payload" }, { status: 400 });
  }

  const result = await runDiscordAgent(payload);
  return NextResponse.json(result);
}
