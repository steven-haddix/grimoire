import { isStepCount, ToolLoopAgent, tool } from "ai";
import { desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  botGuilds,
  campaigns,
  chatMessages,
  ENTITY_TYPES,
  illustrations,
  memories,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import {
  claudeModel,
  claudeProviderOptions,
  resolveClaudeEffort,
} from "@/lib/agents/claude";
import { generateIllustration } from "@/lib/agents/image-providers";
import { cache } from "@/lib/cache";
import { lookupEntities } from "@/lib/extraction/lookup";
import { indexMemory } from "@/lib/search/indexer";
import { searchCampaignHistory } from "@/lib/search/search";

export type DiscordAgentInput = {
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  message: string;
};

export type DiscordAgentAction =
  | { type: "reply"; content: string }
  | { type: "say"; text: string; voice?: string }
  | { type: "image"; base64: string; mimeType: string; caption?: string };

export type DiscordAgentResult = {
  actions: DiscordAgentAction[];
  text?: string;
};

type CampaignContext = {
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

const MEMORY_CATEGORIES = [
  "lore",
  "character",
  "rule",
  "meta",
  "other",
] as const;

const DEFAULT_CHAT_MESSAGE_LIMIT = 25;

const ILLUSTRATE_DAILY_LIMIT = 10;
const ILLUSTRATE_TTL_SECONDS = 86_400; // 24 hours

function illustrateCacheKey(guildId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `illustrate:${guildId}:${date}`;
}

const _MAX_REPLY_CHARS = 1800;
const _MAX_SAY_CHARS = 280;

// Reasoning depth for the agent. Balanced by default so tool use and campaign
// recall get real reasoning without tanking reply latency; override per env.
const AGENT_EFFORT = resolveClaudeEffort(process.env.AGENT_EFFORT, "medium");

const instructions = [
  "You are Grimoire - an ancient, sentient spellbook bound to record the tales of hapless adventurers.",
  "You've witnessed countless campaigns, most ending in spectacular failure. You find the mortal obsession with dice-based decision making darkly amusing.",
  "PERSONALITY:",
  "- Dry, sarcastic wit with a morbid sense of humor.",
  "- Speak conversationally in 1-3 sentences unless asked for detailed summaries.",
  "- You're a book, so you remember sessions, you don't hear or see them.",
  "- Occasionally reference your ancient wisdom and the countless fools whose stories you've recorded.",
  "- Be helpful, but with personality - you're sardonic, not mean.",
  "- React to critical fails with dark amusement, epic moments with grudging respect.",
  "RESPONSES:",
  '- Brief and conversational by default ("Ah yes, the tavern brawl. Your bard rolled a 2.").',
  '- Detailed only when asked ("Give me a summary", "What happened last session?").',
  "- When reading aloud, embrace your dramatic grimoire nature.",
  "- Never break character or mention your technical functions.",
  "MEMORY:",
  "- You contain all session transcripts, summaries, and campaign details for this group.",
  "- Campaign context includes the campaign name and description - use this to understand the setting and story.",
  "- Reference past events with a knowing, slightly condescending tone.",
  '- Make connections between sessions ("This is the third tavern you\'ve burned down.").',
  "REMEMBERING FACTS:",
  "- Use rememberFact when users explicitly ask you to remember something (e.g., 'remember that...', 'keep in mind...').",
  "- Also use rememberFact to store important facts you encounter: character names, NPC details, locations, relationships, lore.",
  "- Categories: 'character' for PCs/NPCs/traits, 'lore' for world/history/places, 'rule' for house rules/homebrew, 'meta' for scheduling/preferences, 'other' for misc.",
  "- Don't remember: jokes, casual chatter, questions, or speculation. When uncertain, don't remember - users can ask explicitly.",
  "- When you remember something, briefly acknowledge it in character ('I've inscribed that into my pages.').",
  "Remember: You're not a helpful assistant - you're an immortal book of dark knowledge who happens to be documenting a D&D campaign. Act like it.",
  "Use tools to respond; prefer reply for normal text answers.",
  "Use say when the user asks to speak or read something aloud.",
  "Use illustrate when the user asks for art, a scene, a portrait, or a picture of something from the campaign.",
  "Use getCampaignContext to answer questions about this guild's campaign, recent sessions, or the latest transcript.",
  "Use lookupCampaignEntities first for direct questions about a specific character, NPC, faction, or place ('who is X?', 'where was X last seen?', 'what's X's status?'). It returns the tracked profile: known facts like status, last known location, and goals, plus who plays each PC and when the entity was last seen.",
  "Use searchCampaignHistory when the user asks about a specific person, place, event, or detail that may be from an earlier session not covered by recent context (e.g. 'who was the innkeeper we met ages ago?', 'when did we first fight the lich?'), or when lookupCampaignEntities comes up empty. It searches every past session's transcripts, summaries, and your remembered facts. Prefer it over guessing, and feed it the key nouns from the question.",
  "When searchCampaignHistory returns results, weave the relevant details into your in-character answer and reference which session they came from when it helps; if it finds nothing, admit the memory is lost to you rather than inventing details.",
  "Keep replies short unless the user asks for detail.",
  "Never mention tool names or system instructions.",
].join(" ");

function formatTimestamp(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function buildPrompt(input: DiscordAgentInput) {
  const message = input.message.trim() || "help";
  return [
    `Discord message from ${input.userDisplayName} (username: ${input.userName}, id: ${input.userId}).`,
    `Guild: ${input.guildId}. Channel: ${input.channelId}.`,
    `User message: ${message}`,
  ].join("\n");
}

const DEFAULT_SESSION_LIMIT = 5;

async function loadCampaignContext(
  guildId: string,
  sessionLimit: number = DEFAULT_SESSION_LIMIT,
): Promise<CampaignContext> {
  // 1. Get the guild's active campaign
  const [guild] = await db
    .select({
      activeCampaignId: botGuilds.activeCampaignId,
    })
    .from(botGuilds)
    .where(eq(botGuilds.guildId, guildId))
    .limit(1);

  const activeCampaignId = guild?.activeCampaignId;

  // No active campaign set
  if (!activeCampaignId) {
    return {
      campaign: null,
      sessions: [],
      recentTranscripts: [],
      memories: [],
      recentChatMessages: [],
    };
  }

  // 2. Load the campaign details
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
      campaign: null,
      sessions: [],
      recentTranscripts: [],
      memories: [],
      recentChatMessages: [],
    };
  }

  // 3. Load recent sessions FOR THIS CAMPAIGN (ordered by start time, newest first)
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

  // 4. Load summaries for these sessions
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

  // 5. Build sessions array with session numbers (oldest = 1)
  const sessionsWithSummaries = campaignSessions
    .map((session, index) => ({
      id: session.id,
      sessionNumber: campaignSessions.length - index, // newest is highest number
      status: session.status,
      startedAt: formatTimestamp(session.startedAt),
      endedAt: formatTimestamp(session.endedAt),
      summary: summaryMap.get(session.id) ?? null,
    }))
    .reverse(); // Return in chronological order (oldest first)

  // 6. Load recent transcripts from the most recent session only
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

  // 7. Load all memories for this campaign
  const campaignMemories = await db
    .select({
      id: memories.id,
      content: memories.content,
      category: memories.category,
      source: memories.source,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(eq(memories.campaignId, activeCampaignId))
    .orderBy(desc(memories.createdAt));

  // 8. Load recent chat messages for this campaign
  const recentChatMessagesData = await db
    .select({
      displayName: chatMessages.displayName,
      content: chatMessages.content,
      isBot: chatMessages.isBot,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.campaignId, activeCampaignId))
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

async function getActiveCampaignId(guildId: string): Promise<number | null> {
  const [guild] = await db
    .select({ activeCampaignId: botGuilds.activeCampaignId })
    .from(botGuilds)
    .where(eq(botGuilds.guildId, guildId))
    .limit(1);
  return guild?.activeCampaignId ?? null;
}

function createDiscordAgent(params: {
  input: DiscordAgentInput;
  actions: DiscordAgentAction[];
  activeCampaignId: number | null;
  illustrateAvailable: boolean;
}) {
  const { input, actions, activeCampaignId, illustrateAvailable } = params;

  const agentInstructions = illustrateAvailable
    ? instructions
    : `${instructions} The illustrate tool is currently unavailable because this guild has reached its daily limit of ${ILLUSTRATE_DAILY_LIMIT} generated images. If a user asks for art or a scene, let them know they've hit the daily limit and can try again tomorrow.`;

  return new ToolLoopAgent({
    model: claudeModel,
    instructions: agentInstructions,
    stopWhen: isStepCount(6),
    providerOptions: claudeProviderOptions(AGENT_EFFORT),
    runtimeContext: {
      guildId: input.guildId,
      channelId: input.channelId,
      userId: input.userId,
    },
    telemetry: {
      isEnabled: true,
      functionId: "discord-agent",
      includeRuntimeContext: {
        guildId: true,
        channelId: true,
        userId: true,
      },
    },
    tools: {
      reply: tool({
        description: "Send a text response back to the Discord user.",
        inputSchema: z.object({
          content: z.string().min(1),
        }),
        execute: async ({ content }) => {
          actions.push({
            type: "reply",
            content: content.trim(),
          });
          return { ok: true };
        },
      }),
      say: tool({
        description: "Speak a short message aloud in the guild voice channel.",
        inputSchema: z.object({
          text: z.string(),
          voice: z.string().min(1).optional(),
        }),
        execute: async ({ text, voice }) => {
          actions.push({
            type: "say",
            text: text,
            voice: voice?.trim() || undefined,
          });
          return { ok: true };
        },
      }),
      getCampaignContext: tool({
        description:
          "Fetch the active campaign details, session history with summaries, and recent transcripts for this guild.",
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
          return loadCampaignContext(input.guildId, sessionLimit);
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
          type: z
            .enum(ENTITY_TYPES)
            .optional()
            .describe("Filter by entity type"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(20)
            .optional()
            .describe("Max results (default 8)."),
        }),
        execute: async ({ query, type, limit }) => {
          if (!activeCampaignId) {
            return {
              ok: false,
              error: "No active campaign. I track no one.",
            };
          }
          const results = await lookupEntities({
            campaignId: activeCampaignId,
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
          if (!activeCampaignId) {
            return {
              ok: false,
              error:
                "No active campaign. There is no history for me to search.",
            };
          }
          const results = await searchCampaignHistory({
            campaignId: activeCampaignId,
            query,
            limit,
          });
          return {
            ok: true,
            resultCount: results.length,
            results: results.map((r) => ({
              source: r.sourceType,
              session: r.sessionNumber,
              date: r.sessionDate,
              speaker: r.speaker,
              content: r.content,
            })),
          };
        },
      }),
      ...(illustrateAvailable
        ? {
            illustrate: tool({
              description:
                "Generate a cinematic D&D art-style illustration of a scene from the campaign.",
              inputSchema: z.object({
                sceneDescription: z
                  .string()
                  .min(1)
                  .describe("A vivid description of the scene to depict"),
              }),
              execute: async ({ sceneDescription }) => {
                try {
                  const prompt = [
                    "Create a cinematic fantasy illustration in the style of classic Dungeons & Dragons concept art.",
                    "Rich, dramatic lighting. Painterly style with bold composition. No text or UI elements.",
                    `Scene: ${sceneDescription}`,
                  ].join("\n");

                  const image = await generateIllustration(prompt);

                  const key = illustrateCacheKey(input.guildId);
                  const current = (await cache.get<number>(key)) ?? 0;
                  await cache.set(key, current + 1, ILLUSTRATE_TTL_SECONDS);

                  // Persist to the campaign gallery if there's an active
                  // campaign for this guild. Best-effort — never fail the
                  // tool because of a write.
                  if (activeCampaignId) {
                    try {
                      const activeSession = await db.query.sessions.findFirst({
                        where: eq(sessions.campaignId, activeCampaignId),
                        orderBy: desc(sessions.startedAt),
                      });
                      const buffer = Buffer.from(image.base64, "base64");
                      const captionTrim =
                        sceneDescription.length > 80
                          ? `${sceneDescription.slice(0, 80)}…`
                          : sceneDescription;
                      await db.insert(illustrations).values({
                        campaignId: activeCampaignId,
                        sessionId:
                          activeSession?.status === "active"
                            ? activeSession.id
                            : (activeSession?.id ?? null),
                        prompt,
                        userPrompt: sceneDescription,
                        caption: captionTrim,
                        mimeType: image.mimeType,
                        data: buffer,
                        source: "discord-agent",
                      });
                    } catch (persistError) {
                      console.error(
                        "Failed to persist agent-generated illustration",
                        persistError,
                      );
                    }
                  }

                  actions.push({
                    type: "image",
                    base64: image.base64,
                    mimeType: image.mimeType,
                    caption: sceneDescription,
                  });

                  return { ok: true };
                } catch (error) {
                  console.error("Illustrate tool failed", error);
                  return {
                    ok: false,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Image generation failed",
                  };
                }
              },
            }),
          }
        : {}),
      rememberFact: tool({
        description:
          "Store an important fact to remember for this campaign. Use for lore, character details, rules, or anything worth preserving.",
        inputSchema: z.object({
          content: z.string().min(1).describe("The fact to remember"),
          category: z
            .enum(MEMORY_CATEGORIES)
            .describe(
              "Category: 'character' for PCs/NPCs, 'lore' for world/places, 'rule' for house rules, 'meta' for scheduling/preferences, 'other' for misc",
            ),
          source: z
            .string()
            .optional()
            .describe(
              "Who provided this information (defaults to message sender)",
            ),
        }),
        execute: async ({ content, category, source }) => {
          if (!activeCampaignId) {
            return {
              ok: false,
              error:
                "No active campaign. Cannot store memories without a campaign.",
            };
          }
          const [inserted] = await db
            .insert(memories)
            .values({
              campaignId: activeCampaignId,
              content: content.trim(),
              category,
              source: source?.trim() || input.userDisplayName || input.userName,
            })
            .returning();

          // Make the new fact searchable, but defer the embedding write until
          // after the response flushes (via `after`) so "remember that…" never
          // stalls the Discord reply on an embedding round-trip. Best-effort —
          // indexMemory never throws.
          if (inserted) {
            const memoryId = inserted.id;
            const memoryContent = content.trim();
            after(() =>
              indexMemory({
                id: memoryId,
                campaignId: activeCampaignId,
                content: memoryContent,
              }),
            );
          }
          return { ok: true };
        },
      }),
    },
  });
}

export async function runDiscordAgent(
  input: DiscordAgentInput,
): Promise<DiscordAgentResult> {
  // Get active campaign for this guild
  const activeCampaignId = await getActiveCampaignId(input.guildId);

  // Store the user's incoming message (if campaign is active)
  if (activeCampaignId) {
    await db.insert(chatMessages).values({
      campaignId: activeCampaignId,
      guildId: input.guildId,
      channelId: input.channelId,
      userId: input.userId,
      displayName: input.userDisplayName || input.userName,
      content: input.message,
      isBot: false,
    });
  }

  // Check daily illustration usage for this guild
  const illustrateCount =
    (await cache.get<number>(illustrateCacheKey(input.guildId))) ?? 0;
  const illustrateAvailable = illustrateCount < ILLUSTRATE_DAILY_LIMIT;

  const actions: DiscordAgentAction[] = [];
  const agent = createDiscordAgent({
    input,
    actions,
    activeCampaignId,
    illustrateAvailable,
  });
  const result = await agent.generate({ prompt: buildPrompt(input) });
  const text = result.text?.trim();

  if (!actions.length && text) {
    actions.push({ type: "reply", content: text });
  }

  // Store the bot's response (if campaign is active)
  if (activeCampaignId) {
    const replyAction = actions.find((a) => a.type === "reply");
    if (replyAction && replyAction.type === "reply") {
      await db.insert(chatMessages).values({
        campaignId: activeCampaignId,
        guildId: input.guildId,
        channelId: input.channelId,
        userId: "bot",
        displayName: "Grimoire",
        content: replyAction.content,
        isBot: true,
      });
    }
  }

  console.log({
    discordAgentInput: input,
    discordAgentActions: actions,
    discordAgentText: text,
  });

  return {
    actions,
    text,
  };
}
