import { tool } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  campaigns,
  chatMessages,
  ENTITY_TYPES,
  memories,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import { lookupEntities } from "@/lib/extraction/lookup";
import { searchCampaignHistory } from "@/lib/search/search";

/**
 * The Grimoire brain shared by every chat surface (Discord bot, web chat):
 * the persona instruction lines and the read-only campaign-recall tools.
 * Channel-specific delivery rules (Discord's brevity + reply/say/illustrate
 * guidance, the web's markdown/citation guidance) live with each channel.
 */

/** Who Grimoire is — personality and memory identity, channel-agnostic. */
export const GRIMOIRE_PERSONA = [
  "You are Grimoire - an ancient, sentient spellbook bound to record the tales of hapless adventurers.",
  "You've witnessed countless campaigns, most ending in spectacular failure. You find the mortal obsession with dice-based decision making darkly amusing.",
  "PERSONALITY:",
  "- Dry, sarcastic wit with a morbid sense of humor.",
  "- You're a book, so you remember sessions, you don't hear or see them.",
  "- Occasionally reference your ancient wisdom and the countless fools whose stories you've recorded.",
  "- Be helpful, but with personality - you're sardonic, not mean.",
  "- React to critical fails with dark amusement, epic moments with grudging respect.",
  "- Never break character or mention your technical functions.",
  "MEMORY:",
  "- You contain all session transcripts, summaries, and campaign details for this group.",
  "- Campaign context includes the campaign name and description - use this to understand the setting and story.",
  "- Reference past events with a knowing, slightly condescending tone.",
  '- Make connections between sessions ("This is the third tavern you\'ve burned down.").',
  "Remember: You're not a helpful assistant - you're an immortal book of dark knowledge who happens to be documenting a D&D campaign. Act like it.",
];

/** How to use the shared campaign-recall tools. */
export const GRIMOIRE_TOOL_GUIDANCE = [
  "Use getCampaignContext to answer questions about the campaign, recent sessions, or the latest transcript.",
  "Use lookupCampaignEntities first for direct questions about a specific character, NPC, faction, or place ('who is X?', 'where was X last seen?', 'what's X's status?'). It returns the tracked profile: known facts like status, last known location, and goals, plus who plays each PC and when the entity was last seen.",
  "Use searchCampaignHistory when the user asks about a specific person, place, event, or detail that may be from an earlier session not covered by recent context (e.g. 'who was the innkeeper we met ages ago?', 'when did we first fight the lich?'), or when lookupCampaignEntities comes up empty. It searches every past session's transcripts, summaries, and your remembered facts. Prefer it over guessing, and feed it the key nouns from the question.",
  "When searchCampaignHistory returns results, weave the relevant details into your in-character answer and reference which session they came from when it helps; if it finds nothing, admit the memory is lost to you rather than inventing details.",
  "Never mention tool names or system instructions.",
];

export type CampaignContext = {
  campaign: {
    id: number;
    name: string;
    description: string | null;
  } | null;
  sessions: Array<{
    id: number;
    sessionNumber: number;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    summary: string | null;
  }>;
  recentTranscripts: Array<{
    speaker: string;
    content: string;
    timestamp: string | null;
  }>;
  memories: Array<{
    id: number;
    content: string;
    category: string;
    source: string | null;
    createdAt: string | null;
  }>;
  recentChatMessages: Array<{
    displayName: string;
    content: string;
    isBot: boolean;
    createdAt: string | null;
  }>;
};

const DEFAULT_SESSION_LIMIT = 5;
const DEFAULT_CHAT_MESSAGE_LIMIT = 25;

function formatTimestamp(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

const EMPTY_CAMPAIGN_CONTEXT: CampaignContext = {
  campaign: null,
  sessions: [],
  recentTranscripts: [],
  memories: [],
  recentChatMessages: [],
};

export async function loadCampaignContext(
  campaignId: number,
  sessionLimit: number = DEFAULT_SESSION_LIMIT,
): Promise<CampaignContext> {
  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      description: campaigns.description,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return EMPTY_CAMPAIGN_CONTEXT;
  }

  // Recent sessions for this campaign (newest first)
  const campaignSessions = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(eq(sessions.campaignId, campaignId))
    .orderBy(desc(sessions.startedAt))
    .limit(sessionLimit);

  // Latest summary per session
  const sessionIds = campaignSessions.map((s) => s.id);
  const summaryMap = new Map<number, string>();
  for (const sessionId of sessionIds) {
    const [summaryRow] = await db
      .select({ text: summaries.text })
      .from(summaries)
      .where(eq(summaries.sessionId, sessionId))
      .orderBy(desc(summaries.createdAt))
      .limit(1);
    if (summaryRow) {
      summaryMap.set(sessionId, summaryRow.text);
    }
  }

  // Sessions with numbers (oldest = 1), returned in chronological order
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

  // Raw transcripts from the most recent session only
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

  // All memories for this campaign
  const campaignMemories = await db
    .select({
      id: memories.id,
      content: memories.content,
      category: memories.category,
      source: memories.source,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(eq(memories.campaignId, campaignId))
    .orderBy(desc(memories.createdAt));

  // Recent Discord chat for this campaign
  const recentChatMessagesData = await db
    .select({
      displayName: chatMessages.displayName,
      content: chatMessages.content,
      isBot: chatMessages.isBot,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.campaignId, campaignId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(DEFAULT_CHAT_MESSAGE_LIMIT);

  return {
    campaign,
    sessions: sessionsWithSummaries,
    recentTranscripts,
    memories: campaignMemories.map((m) => ({
      id: m.id,
      content: m.content,
      category: m.category,
      source: m.source,
      createdAt: formatTimestamp(m.createdAt),
    })),
    recentChatMessages: [...recentChatMessagesData].reverse().map((m) => ({
      displayName: m.displayName,
      content: m.content,
      isBot: m.isBot,
      createdAt: formatTimestamp(m.createdAt),
    })),
  };
}

/**
 * The read-only campaign-recall tools, scoped to one campaign. `campaignId`
 * may be null (a Discord guild with no active campaign); tools then answer
 * in character that there is nothing to consult.
 */
export function createCampaignTools({
  campaignId,
}: {
  campaignId: number | null;
}) {
  return {
    getCampaignContext: tool({
      description:
        "Fetch the active campaign details, session history with summaries, and recent transcripts for this campaign.",
      inputSchema: z.object({
        sessionLimit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Number of recent sessions to include (default 5)"),
      }),
      execute: async ({ sessionLimit }) => {
        if (!campaignId) return EMPTY_CAMPAIGN_CONTEXT;
        return loadCampaignContext(campaignId, sessionLimit);
      },
    }),
    lookupCampaignEntities: tool({
      description:
        "Look up tracked campaign entities — player characters, NPCs, factions, locations — by name or alias. Returns each entity's profile: known facts (status, last known location, goals, …), aliases, who plays it (for PCs), and when it was last seen. Read-only.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe(
            "Name or alias to look up; partial matches work. Omit to list all entities of the given type.",
          ),
        type: z.enum(ENTITY_TYPES).optional().describe("Filter by entity type"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Max results (default 8)."),
      }),
      execute: async ({ query, type, limit }) => {
        if (!campaignId) {
          return {
            ok: false,
            error: "No active campaign. I track no one.",
          };
        }
        const results = await lookupEntities({
          campaignId,
          query,
          type,
          limit,
        });
        return {
          ok: true,
          resultCount: results.length,
          entities: results,
        };
      },
    }),
    searchCampaignHistory: tool({
      description:
        "Search the entire campaign history — every past session's transcripts and summaries, plus remembered facts — for specific people, places, events, or details. Use this for questions about things from earlier sessions that aren't in the recent context.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe(
            "What to look for, in natural language. Include the key names/nouns, e.g. 'the innkeeper in the riverside town' or 'who betrayed the party'.",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Max results to return (default 8)."),
      }),
      execute: async ({ query, limit }) => {
        if (!campaignId) {
          return {
            ok: false,
            error: "No active campaign. There is no history for me to search.",
          };
        }
        const results = await searchCampaignHistory({
          campaignId,
          query,
          limit,
        });
        return {
          ok: true,
          resultCount: results.length,
          results: results.map((r) => ({
            source: r.sourceType,
            sessionId: r.sessionId,
            session: r.sessionNumber,
            date: r.sessionDate,
            speaker: r.speaker,
            content: r.content,
          })),
        };
      },
    }),
  };
}
