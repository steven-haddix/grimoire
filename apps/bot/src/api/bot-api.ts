import type { BotConfig } from "../config";

export type AgentAction =
  | { type: "reply"; content: string }
  | { type: "say"; text: string; voice?: string };

export type AgentResponse = {
  actions: AgentAction[];
  text?: string;
};

export type AgentRequest = {
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  message: string;
};

export type GuildPresence = {
  guildId: string;
  name: string;
  icon: string | null;
};

export type Campaign = {
  id: number;
  guildId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BotApi = {
  upsertGuildPresence: (guild: GuildPresence) => Promise<void>;
  markGuildRemoved: (guildId: string) => Promise<void>;
  syncGuildPresence: (guilds: GuildPresence[]) => Promise<void>;
  startSession: (params: {
    guildId: string;
    channelId: string;
  }) => Promise<number>;
  ingestTranscript: (params: {
    sessionId: number;
    speaker: string;
    text: string;
    timestamp: string;
  }) => Promise<void>;
  summarizeSession: (sessionId: number) => Promise<void>;
  runAgent: (input: AgentRequest) => Promise<AgentAction[]>;
  createCampaign: (params: {
    guildId: string;
    name: string;
    description?: string;
  }) => Promise<Campaign>;
  listCampaigns: (guildId: string) => Promise<{
    campaigns: Campaign[];
    activeCampaignId?: number;
  }>;
  setActiveCampaign: (params: {
    guildId: string;
    name: string;
  }) => Promise<Campaign>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAgentAction(value: unknown): value is AgentAction {
  if (!isRecord(value)) return false;
  if (value.type === "reply") {
    return typeof value.content === "string" && value.content.trim().length > 0;
  }
  if (value.type === "say") {
    return typeof value.text === "string" && value.text.trim().length > 0;
  }
  return false;
}

function parseAgentResponse(value: unknown): AgentResponse | null {
  if (!isRecord(value)) return null;
  const actionsRaw = Array.isArray(value.actions) ? value.actions : [];
  const actions = actionsRaw.filter(isAgentAction);
  const text = typeof value.text === "string" ? value.text.trim() : undefined;
  return { actions, text };
}

export function createBotApi(config: BotConfig): BotApi {
  const postBotJson = async (path: string, payload: unknown, context: string) => {
    const res = await fetch(`${config.apiBase}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": config.botSecret,
      } as Record<string, string>,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const details = await res.text().catch(() => "");
      throw new Error(
        `${context} failed (${res.status}): ${details || "No details"}`,
      );
    }

    return res;
  };

  return {
    upsertGuildPresence: async (guild) => {
      await postBotJson(
        "/bot/guilds",
        {
          guildId: guild.guildId,
          name: guild.name,
          icon: guild.icon ?? null,
          installed: true,
        },
        "Guild presence update",
      );
    },
    markGuildRemoved: async (guildId) => {
      await postBotJson(
        "/bot/guilds",
        { guildId, installed: false },
        "Guild presence removal",
      );
    },
    syncGuildPresence: async (guilds) => {
      await postBotJson(
        "/bot/guilds/sync",
        { guilds },
        "Guild presence sync",
      );
    },
    startSession: async ({ guildId, channelId }) => {
      const res = await postBotJson(
        "/session/start",
        { guildId, channelId },
        "Session start",
      );
      const data = (await res.json()) as { sessionId: number };
      return data.sessionId;
    },
    ingestTranscript: async ({ sessionId, speaker, text, timestamp }) => {
      await postBotJson(
        "/ingest",
        { sessionId, speaker, text, timestamp },
        "Transcript ingest",
      );
    },
    summarizeSession: async (sessionId) => {
      await postBotJson(
        "/summarize",
        { sessionId },
        "Session summarize",
      );
    },
    runAgent: async (input) => {
      const res = await postBotJson(
        "/agent/discord",
        input,
        "Agent request",
      );

      const parsed = parseAgentResponse(await res.json().catch(() => null));
      if (!parsed) {
        throw new Error("Agent response was invalid");
      }

      if (!parsed.actions.length && parsed.text) {
        parsed.actions.push({ type: "reply", content: parsed.text });
      }

      return parsed.actions;
    },
    createCampaign: async ({ guildId, name, description }) => {
      const res = await postBotJson(
        "/bot/campaigns",
        { guildId, name, description },
        "Campaign create",
      );
      return (await res.json()) as Campaign;
    },
    listCampaigns: async (guildId) => {
      const res = await fetch(`${config.apiBase}/bot/campaigns?guildId=${guildId}`, {
        headers: {
          "x-bot-secret": config.botSecret,
        },
      });
      if (!res.ok) {
        throw new Error("List campaigns failed");
      }
      return (await res.json()) as {
        campaigns: Campaign[];
        activeCampaignId?: number;
      };
    },
    setActiveCampaign: async ({ guildId, name }) => {
      const res = await postBotJson(
        "/bot/campaigns/active",
        { guildId, name },
        "Set active campaign",
      );
      const data = (await res.json()) as { campaign: Campaign };
      return data.campaign;
    },
  };
}
