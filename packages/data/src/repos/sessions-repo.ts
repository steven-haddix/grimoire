import { asc, eq } from "drizzle-orm";
import type { RuntimeDb } from "../client";
import { botGuilds, campaigns, sessions, transcripts } from "../schema-runtime";
import { insertSummary } from "./summaries-repo";

export type StartSessionInput = {
  guildId: string;
  channelId: string;
};

export type CompleteSessionInput = {
  sessionId: number;
  summaryText?: string;
  status?: string;
};

export type SessionContext = {
  sessionId: number;
  guildId: string;
  campaign: {
    name: string;
    description: string | null;
  } | null;
  transcript: Array<{
    speaker: string;
    content: string;
    timestamp: string;
  }>;
};

export async function startSession(db: RuntimeDb, input: StartSessionInput) {
  const [guildData] = await db
    .select({ activeCampaignId: botGuilds.activeCampaignId })
    .from(botGuilds)
    .where(eq(botGuilds.guildId, input.guildId))
    .limit(1);

  const [newSession] = await db
    .insert(sessions)
    .values({
      guildId: input.guildId,
      channelId: input.channelId,
      campaignId: guildData?.activeCampaignId ?? null,
      status: "active",
    })
    .returning({ id: sessions.id });

  if (!newSession) {
    throw new Error("Failed to create session");
  }

  return newSession.id;
}

export async function getSessionContext(
  db: RuntimeDb,
  sessionId: number,
): Promise<SessionContext | null> {
  const [session] = await db
    .select({
      id: sessions.id,
      guildId: sessions.guildId,
      campaignId: sessions.campaignId,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    return null;
  }

  const campaign = session.campaignId
    ? await db
        .select({
          name: campaigns.name,
          description: campaigns.description,
        })
        .from(campaigns)
        .where(eq(campaigns.id, session.campaignId))
        .then((rows) => rows[0] ?? null)
    : null;

  const lines = await db
    .select({
      speaker: transcripts.speaker,
      content: transcripts.content,
      timestamp: transcripts.timestamp,
    })
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .orderBy(asc(transcripts.timestamp));

  return {
    sessionId: session.id,
    guildId: session.guildId,
    campaign,
    transcript: lines.map((line) => ({
      speaker: line.speaker,
      content: line.content,
      timestamp: line.timestamp.toISOString(),
    })),
  };
}

export async function completeSession(
  db: RuntimeDb,
  input: CompleteSessionInput,
) {
  const summaryText = input.summaryText?.trim();

  if (summaryText) {
    await insertSummary(db, {
      sessionId: input.sessionId,
      text: summaryText,
    });
  }

  const status =
    input.status ?? (summaryText ? "completed" : "completed_no_summary");

  await db
    .update(sessions)
    .set({
      status,
      endedAt: new Date(),
    })
    .where(eq(sessions.id, input.sessionId));

  return {
    sessionId: input.sessionId,
    status,
    summary: summaryText ?? null,
  };
}
