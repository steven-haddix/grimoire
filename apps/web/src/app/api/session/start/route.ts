import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, botGuilds } from "@/db/schema";
import { eq } from "drizzle-orm";

type SessionStartPayload = {
  guildId: string;
  channelId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSessionStartPayload(value: unknown): SessionStartPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.guildId !== "string" || value.guildId.trim() === "") {
    return null;
  }

  if (typeof value.channelId !== "string" || value.channelId.trim() === "") {
    return null;
  }

  return {
    guildId: value.guildId,
    channelId: value.channelId,
  };
}

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = parseSessionStartPayload(await req.json().catch(() => null));

  if (!payload) {
    return NextResponse.json(
      { error: "Missing guildId or channelId" },
      { status: 400 },
    );
  }

  const guildData = await db.query.botGuilds.findFirst({
    where: eq(botGuilds.guildId, payload.guildId),
    columns: { activeCampaignId: true },
  });

  const [newSession] = await db
    .insert(sessions)
    .values({
      guildId: payload.guildId,
      channelId: payload.channelId,
      campaignId: guildData?.activeCampaignId,
      status: "active",
    })
    .returning({ id: sessions.id });

  return NextResponse.json({ sessionId: newSession?.id });
}
