import { and, desc, eq, inArray } from "drizzle-orm";
import type { RuntimeDb } from "../client";
import {
  botGuilds,
  campaigns,
  sessions,
  summaries,
  transcripts,
} from "../schema-runtime";
import type { CampaignContext } from "../types";
import { listRecentChatMessages } from "./chat-messages-repo";
import { listCampaignMemories } from "./memories-repo";

function formatTimestamp(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function createCampaign(
  db: RuntimeDb,
  input: {
    guildId: string;
    name: string;
    description?: string;
  },
) {
  const [newCampaign] = await db
    .insert(campaigns)
    .values({
      guildId: input.guildId,
      name: input.name,
      description: input.description,
    })
    .returning();

  if (!newCampaign) {
    throw new Error("Failed to create campaign");
  }

  const [guildSettings] = await db
    .select({ activeCampaignId: botGuilds.activeCampaignId })
    .from(botGuilds)
    .where(eq(botGuilds.guildId, input.guildId))
    .limit(1);

  if (guildSettings && !guildSettings.activeCampaignId) {
    await db
      .update(botGuilds)
      .set({ activeCampaignId: newCampaign.id })
      .where(eq(botGuilds.guildId, input.guildId));
  }

  return newCampaign;
}

export async function listCampaigns(db: RuntimeDb, guildId: string) {
  const list = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.guildId, guildId))
    .orderBy(desc(campaigns.updatedAt));

  const [guildSettings] = await db
    .select({ activeCampaignId: botGuilds.activeCampaignId })
    .from(botGuilds)
    .where(eq(botGuilds.guildId, guildId))
    .limit(1);

  return {
    campaigns: list,
    activeCampaignId: guildSettings?.activeCampaignId ?? undefined,
  };
}

export async function setActiveCampaignByName(
  db: RuntimeDb,
  input: {
    guildId: string;
    name: string;
  },
) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(
      and(eq(campaigns.guildId, input.guildId), eq(campaigns.name, input.name)),
    )
    .limit(1);

  if (!campaign) {
    return null;
  }

  await db
    .update(botGuilds)
    .set({ activeCampaignId: campaign.id })
    .where(eq(botGuilds.guildId, input.guildId));

  return campaign;
}

export async function getActiveCampaignId(db: RuntimeDb, guildId: string) {
  const [guild] = await db
    .select({ activeCampaignId: botGuilds.activeCampaignId })
    .from(botGuilds)
    .where(eq(botGuilds.guildId, guildId))
    .limit(1);

  return guild?.activeCampaignId ?? null;
}

export async function loadCampaignContext(
  db: RuntimeDb,
  input: { guildId: string; sessionLimit?: number; chatLimit?: number },
): Promise<CampaignContext> {
  const sessionLimit = input.sessionLimit ?? 5;
  const chatLimit = input.chatLimit ?? 25;

  const activeCampaignId = await getActiveCampaignId(db, input.guildId);

  if (!activeCampaignId) {
    return {
      activeCampaignId: null,
      campaign: null,
      sessions: [],
      recentTranscripts: [],
      memories: [],
      recentChatMessages: [],
    };
  }

  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      description: campaigns.description,
    })
    .from(campaigns)
    .where(eq(campaigns.id, activeCampaignId))
    .limit(1);

  if (!campaign) {
    return {
      activeCampaignId,
      campaign: null,
      sessions: [],
      recentTranscripts: [],
      memories: [],
      recentChatMessages: [],
    };
  }

  const campaignSessions = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(eq(sessions.campaignId, activeCampaignId))
    .orderBy(desc(sessions.startedAt))
    .limit(sessionLimit);

  const sessionIds = campaignSessions.map((session) => session.id);

  const summaryRows =
    sessionIds.length > 0
      ? await db
          .select({
            sessionId: summaries.sessionId,
            text: summaries.text,
            createdAt: summaries.createdAt,
          })
          .from(summaries)
          .where(inArray(summaries.sessionId, sessionIds))
          .orderBy(desc(summaries.createdAt))
      : [];

  const summaryMap = new Map<number, string>();
  for (const row of summaryRows) {
    if (!summaryMap.has(row.sessionId)) {
      summaryMap.set(row.sessionId, row.text);
    }
  }

  const sessionsWithSummaries = campaignSessions
    .map((session, index) => ({
      id: session.id,
      sessionNumber: campaignSessions.length - index,
      status: session.status,
      startedAt: formatTimestamp(session.startedAt),
      endedAt: formatTimestamp(session.endedAt),
      summary: summaryMap.get(session.id) ?? null,
    }))
    .reverse();

  const latestSession = campaignSessions[0];
  const recentTranscripts = latestSession
    ? await db
        .select({
          speaker: transcripts.speaker,
          content: transcripts.content,
          timestamp: transcripts.timestamp,
        })
        .from(transcripts)
        .where(eq(transcripts.sessionId, latestSession.id))
        .orderBy(desc(transcripts.timestamp))
        .then((rows) =>
          [...rows].reverse().map((row) => ({
            speaker: row.speaker,
            content: row.content,
            timestamp: formatTimestamp(row.timestamp),
          })),
        )
    : [];

  const campaignMemories = await listCampaignMemories(db, activeCampaignId);
  const recentChatMessages = await listRecentChatMessages(
    db,
    activeCampaignId,
    chatLimit,
  );

  return {
    activeCampaignId,
    campaign,
    sessions: sessionsWithSummaries,
    recentTranscripts,
    memories: campaignMemories.map((memory) => ({
      id: memory.id,
      content: memory.content,
      category: memory.category,
      source: memory.source,
      createdAt: formatTimestamp(memory.createdAt),
    })),
    recentChatMessages: [...recentChatMessages].reverse().map((message) => ({
      displayName: message.displayName,
      content: message.content,
      isBot: message.isBot,
      createdAt: formatTimestamp(message.createdAt),
    })),
  };
}
