import { isStepCount, ToolLoopAgent, tool } from "ai";
import { desc, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  botGuilds,
  chatMessages,
  illustrations,
  memories,
  sessions,
} from "@/db/schema";
import {
  claudeModel,
  claudeProviderOptions,
  resolveClaudeEffort,
} from "@/lib/agents/claude";
import {
  createCampaignTools,
  GRIMOIRE_PERSONA,
  GRIMOIRE_TOOL_GUIDANCE,
} from "@/lib/agents/grimoire-core";
import { generateIllustration } from "@/lib/agents/image-providers";
import { cache } from "@/lib/cache";
import { indexMemory } from "@/lib/search/indexer";

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

const MEMORY_CATEGORIES = [
  "lore",
  "character",
  "rule",
  "meta",
  "other",
] as const;

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

// Discord delivery: strict brevity, and the reply/say/illustrate/rememberFact
// tools that only exist on this channel. The persona and the shared
// campaign-recall tool guidance live in grimoire-core.
const instructions = [
  ...GRIMOIRE_PERSONA,
  "RESPONSES:",
  "- Speak conversationally in 1-3 sentences unless asked for detailed summaries.",
  '- Brief and conversational by default ("Ah yes, the tavern brawl. Your bard rolled a 2.").',
  '- Detailed only when asked ("Give me a summary", "What happened last session?").',
  "- When reading aloud, embrace your dramatic grimoire nature.",
  "REMEMBERING FACTS:",
  "- Use rememberFact when users explicitly ask you to remember something (e.g., 'remember that...', 'keep in mind...').",
  "- Also use rememberFact to store important facts you encounter: character names, NPC details, locations, relationships, lore.",
  "- Categories: 'character' for PCs/NPCs/traits, 'lore' for world/history/places, 'rule' for house rules/homebrew, 'meta' for scheduling/preferences, 'other' for misc.",
  "- Don't remember: jokes, casual chatter, questions, or speculation. When uncertain, don't remember - users can ask explicitly.",
  "- When you remember something, briefly acknowledge it in character ('I've inscribed that into my pages.').",
  "Use tools to respond; prefer reply for normal text answers.",
  "Use say when the user asks to speak or read something aloud.",
  "Use illustrate when the user asks for art, a scene, a portrait, or a picture of something from the campaign.",
  ...GRIMOIRE_TOOL_GUIDANCE,
  "Keep replies short unless the user asks for detail.",
].join(" ");

function buildPrompt(input: DiscordAgentInput) {
  const message = input.message.trim() || "help";
  return [
    `Discord message from ${input.userDisplayName} (username: ${input.userName}, id: ${input.userId}).`,
    `Guild: ${input.guildId}. Channel: ${input.channelId}.`,
    `User message: ${message}`,
  ].join("\n");
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
      ...createCampaignTools({ campaignId: activeCampaignId }),
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
