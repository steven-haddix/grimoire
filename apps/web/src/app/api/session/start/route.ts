import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { botGuilds, sessions } from "@/db/schema";

const RESUME_STALENESS_HOURS = 6;

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

  const staleCutoff = new Date(
    Date.now() - RESUME_STALENESS_HOURS * 60 * 60 * 1000,
  );

  const existing = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.guildId, payload.guildId),
      eq(sessions.channelId, payload.channelId),
      eq(sessions.status, "active"),
      isNull(sessions.endedAt),
      gt(sessions.startedAt, staleCutoff),
    ),
    orderBy: desc(sessions.startedAt),
    columns: { id: true },
  });

  if (existing) {
    return NextResponse.json({ sessionId: existing.id, resumed: true });
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
    .returning();

  return NextResponse.json({ sessionId: newSession?.id, resumed: false });
}
