import type { BotConfig } from "../config";

export type AgentAction =
  | { type: "reply"; content: string }
  | { type: "say"; text: string; voice?: string }
  | { type: "image"; base64: string; mimeType: string; caption?: string };

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
  canManageGuild: boolean;
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

export type CampaignSchedule = {
  id: number;
  campaignId: number;
  guildId: string;
  announcementChannelId: string;
  weekday: number;
  localTime: string;
  timeZone: string;
  enabled: boolean;
  nextOccurrenceAt: string;
};

export type ScheduledJob = {
  id: number;
  type: string;
  scheduleId: number | null;
  sessionId: number | null;
  runAt: string;
  payload: Record<string, unknown>;
  attemptCount: number;
};

export type BotApi = {
  upsertGuildPresence: (guild: GuildPresence) => Promise<void>;
  markGuildRemoved: (guildId: string) => Promise<void>;
  syncGuildPresence: (guilds: GuildPresence[]) => Promise<void>;
  startSession: (params: {
    guildId: string;
    channelId: string;
    textChannelId: string;
  }) => Promise<{
    sessionId: number;
    resumed: boolean;
    stopReminderAt: string;
    autoStopAt: string;
  }>;
  ingestTranscript: (params: {
    sessionId: number;
    speaker: string;
    speakerUserId: string;
    text: string;
    timestamp: string;
  }) => Promise<void>;
  summarizeSession: (sessionId: number) => Promise<void>;
  stopSession: (params: {
    sessionId: number;
    reason:
      | "manual_command"
      | "stop_button"
      | "max_duration"
      | "expired_before_resume";
  }) => Promise<{ stopped: boolean; status: string }>;
  stopActiveSessionForGuild: (params: {
    guildId: string;
    reason: "manual_command" | "stop_button";
  }) => Promise<{ stopped: boolean; status: string }>;
  getSessionState: (sessionId: number) => Promise<{
    session: {
      id: number;
      guildId: string;
      textChannelId: string | null;
      status: string;
      autoStopAt: string | null;
    };
  }>;
  claimScheduledJobs: (params: {
    workerId: string;
    limit?: number;
  }) => Promise<ScheduledJob[]>;
  completeScheduledJob: (jobId: number, workerId: string) => Promise<void>;
  isStartReminderValid: (jobId: number, guildId: string) => Promise<boolean>;
  failScheduledJob: (
    jobId: number,
    workerId: string,
    error: string,
  ) => Promise<void>;
  setCampaignSchedule: (params: {
    guildId: string;
    announcementChannelId: string;
    createdByDiscordUserId: string;
    weekday: number;
    localTime: string;
    timeZone: string;
  }) => Promise<CampaignSchedule>;
  getCampaignSchedule: (guildId: string) => Promise<CampaignSchedule | null>;
  removeCampaignSchedule: (guildId: string) => Promise<boolean>;
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
  if (value.type === "image") {
    return (
      typeof value.base64 === "string" &&
      value.base64.length > 0 &&
      typeof value.mimeType === "string"
    );
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
  const postBotJson = async (
    path: string,
    payload: unknown,
    context: string,
  ) => {
    const res = await fetch(`${config.apiBase}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": config.botSecret,
      } as Record<string, string>,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const details = await res.text();
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
      await postBotJson("/bot/guilds/sync", { guilds }, "Guild presence sync");
    },
    startSession: async ({ guildId, channelId, textChannelId }) => {
      const res = await postBotJson(
        "/session/start",
        { guildId, channelId, textChannelId },
        "Session start",
      );
      const data = (await res.json()) as {
        sessionId: number;
        resumed?: boolean;
        stopReminderAt: string;
        autoStopAt: string;
      };
      return {
        sessionId: data.sessionId,
        resumed: data.resumed ?? false,
        stopReminderAt: data.stopReminderAt,
        autoStopAt: data.autoStopAt,
      };
    },
    ingestTranscript: async ({
      sessionId,
      speaker,
      speakerUserId,
      text,
      timestamp,
    }) => {
      await postBotJson(
        "/ingest",
        { sessionId, speaker, speakerUserId, text, timestamp },
        "Transcript ingest",
      );
    },
    summarizeSession: async (sessionId) => {
      await postBotJson("/summarize", { sessionId }, "Session summarize");
    },
    stopSession: async ({ sessionId, reason }) => {
      const res = await postBotJson(
        "/session/stop",
        { sessionId, reason },
        "Session stop",
      );
      return (await res.json()) as { stopped: boolean; status: string };
    },
    stopActiveSessionForGuild: async ({ guildId, reason }) => {
      const res = await postBotJson(
        "/session/stop",
        { guildId, reason },
        "Session stop",
      );
      return (await res.json()) as { stopped: boolean; status: string };
    },
    getSessionState: async (sessionId) => {
      const res = await fetch(`${config.apiBase}/session/${sessionId}/state`, {
        headers: { "x-bot-secret": config.botSecret },
      });
      if (!res.ok) {
        throw new Error(`Session state failed (${res.status})`);
      }
      return (await res.json()) as {
        session: {
          id: number;
          guildId: string;
          textChannelId: string | null;
          status: string;
          autoStopAt: string | null;
        };
      };
    },
    claimScheduledJobs: async ({ workerId, limit }) => {
      const res = await postBotJson(
        "/bot/jobs/claim",
        { workerId, limit },
        "Scheduled job claim",
      );
      const data = (await res.json()) as { jobs: ScheduledJob[] };
      return data.jobs;
    },
    completeScheduledJob: async (jobId, workerId) => {
      await postBotJson(
        `/bot/jobs/${jobId}/complete`,
        { workerId },
        "Scheduled job completion",
      );
    },
    isStartReminderValid: async (jobId, guildId) => {
      const res = await fetch(
        `${config.apiBase}/bot/jobs/${jobId}/start-valid?guildId=${guildId}`,
        { headers: { "x-bot-secret": config.botSecret } },
      );
      if (!res.ok) {
        throw new Error(`Start reminder validation failed (${res.status})`);
      }
      const data = (await res.json()) as { valid: boolean };
      return data.valid;
    },
    failScheduledJob: async (jobId, workerId, error) => {
      await postBotJson(
        `/bot/jobs/${jobId}/fail`,
        { workerId, error },
        "Scheduled job failure",
      );
    },
    setCampaignSchedule: async (params) => {
      const res = await postBotJson(
        "/bot/schedules",
        params,
        "Set campaign schedule",
      );
      const data = (await res.json()) as { schedule: CampaignSchedule };
      return data.schedule;
    },
    getCampaignSchedule: async (guildId) => {
      const res = await fetch(
        `${config.apiBase}/bot/schedules?guildId=${guildId}`,
        { headers: { "x-bot-secret": config.botSecret } },
      );
      if (!res.ok)
        throw new Error(`Get campaign schedule failed (${res.status})`);
      const data = (await res.json()) as { schedule: CampaignSchedule | null };
      return data.schedule;
    },
    removeCampaignSchedule: async (guildId) => {
      const res = await fetch(`${config.apiBase}/bot/schedules`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-bot-secret": config.botSecret,
        },
        body: JSON.stringify({ guildId }),
      });
      if (!res.ok) {
        throw new Error(`Remove campaign schedule failed (${res.status})`);
      }
      const data = (await res.json()) as { removed: boolean };
      return data.removed;
    },
    runAgent: async (input) => {
      const res = await postBotJson("/agent/discord", input, "Agent request");

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
      const res = await fetch(
        `${config.apiBase}/bot/campaigns?guildId=${guildId}`,
        {
          headers: {
            "x-bot-secret": config.botSecret,
          },
        },
      );
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
