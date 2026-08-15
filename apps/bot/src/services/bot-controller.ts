import type { AgentAction, BotApi } from "../api/bot-api";
import type { BotConfig } from "../config";
import type { TtsVoiceConfig } from "../tts/types";
import type { CommandContext, CommandIntent, VoiceGateway } from "../types";
import type { TranscriptionService } from "./transcription-service";

export type BotController = {
  handleIntent: (intent: CommandIntent, ctx: CommandContext) => Promise<void>;
  handleStartReminder: (jobId: number, ctx: CommandContext) => Promise<void>;
  stopSessionById: (params: {
    guildId: string;
    channelId: string;
    sessionId: number;
    reason: "stop_button" | "max_duration";
    reply: (content: string) => Promise<void>;
  }) => Promise<void>;
};

const HELP_MESSAGE = "Ask me about the session or say `/grim start`.";

function buildVoiceConfig(
  config: BotConfig,
  voiceOverride?: string,
): TtsVoiceConfig {
  return {
    voice: voiceOverride ?? config.ttsVoice,
    options: config.ttsVoiceOptions,
  };
}

export function createBotController(params: {
  config: BotConfig;
  api: BotApi;
  voice: VoiceGateway;
  transcription: TranscriptionService;
  sendChannelMessage?: (channelId: string, content: string) => Promise<void>;
}): BotController {
  const { config, api, voice, transcription } = params;
  const autoStopTimers = new Map<
    string,
    { sessionId: number; timer: ReturnType<typeof setTimeout> }
  >();

  const handleStart = async (ctx: CommandContext) => {
    if (!ctx.voiceChannelId) {
      await ctx.reply("Join a voice channel first.");
      return;
    }

    if (voice.isConnected(ctx.guildId)) {
      await ctx.reply("🟡 Already listening here. Use `/grim stop` first.");
      return;
    }

    try {
      await voice.startListening({
        guildId: ctx.guildId,
        channelId: ctx.voiceChannelId,
      });
    } catch (error) {
      console.error("Voice join failed", error);
      await ctx.reply("❌ Could not join the voice channel.");
      return;
    }

    try {
      const { sessionId, resumed, autoStopAt } = await api.startSession({
        guildId: ctx.guildId,
        channelId: ctx.voiceChannelId,
        textChannelId: ctx.channelId,
      });

      transcription.setSessionId(ctx.guildId, sessionId);
      // An older web deployment may omit autoStopAt; skip the local timer
      // rather than arming it with an Invalid Date (a NaN delay fires at once).
      const autoStopDate = autoStopAt ? new Date(autoStopAt) : null;
      const hasDeadline =
        autoStopDate !== null && Number.isFinite(autoStopDate.getTime());
      if (hasDeadline) {
        armAutoStop({
          guildId: ctx.guildId,
          channelId: ctx.channelId,
          sessionId,
          autoStopAt: autoStopDate,
        });
      }
      const safetyStop = hasDeadline
        ? ` Safety stop <t:${Math.floor(autoStopDate.getTime() / 1000)}:R>.`
        : "";

      await ctx.reply(
        resumed
          ? `📜 **Resumed Session #${sessionId}.** Picking up where we left off.${safetyStop}`
          : `📜 **Session #${sessionId} Started.** I am listening.${safetyStop}`,
      );
    } catch (error) {
      console.error(error);
      voice.stopListening(ctx.guildId);
      await ctx.reply("❌ Could not start session. Check the API.");
    }
  };

  const stopSession = async (params: {
    guildId: string;
    sessionId: number;
    reason: "manual_command" | "stop_button" | "max_duration";
    reply: (content: string) => Promise<void>;
  }) => {
    const localSessionId = transcription.getSessionId(params.guildId);
    if (localSessionId === params.sessionId) {
      const deadline = autoStopTimers.get(params.guildId);
      if (deadline?.sessionId === params.sessionId) {
        clearTimeout(deadline.timer);
        autoStopTimers.delete(params.guildId);
      }
      voice.stopListening(params.guildId);
      await transcription.clearSession(params.guildId);
    }

    let result: { stopped: boolean; status: string };
    try {
      result = await api.stopSession({
        sessionId: params.sessionId,
        reason: params.reason,
      });
    } catch (error) {
      // Local teardown already ran; restore the session mapping so a retried
      // stop reaches the API again instead of "No recording is currently
      // active".
      if (localSessionId === params.sessionId) {
        transcription.setSessionId(params.guildId, params.sessionId);
      }
      throw error;
    }
    if (!result.stopped) {
      await params.reply("That recording has already ended.");
      return;
    }

    await params.reply(
      params.reason === "max_duration"
        ? "🛑 I stopped recording at the four-hour safety limit. Summarizing now."
        : "🛑 Session ended. Summarizing...",
    );
  };

  const armAutoStop = (input: {
    guildId: string;
    channelId: string;
    sessionId: number;
    autoStopAt: Date;
  }) => {
    const existing = autoStopTimers.get(input.guildId);
    if (existing) clearTimeout(existing.timer);

    const delay = Math.max(0, input.autoStopAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      void stopSession({
        guildId: input.guildId,
        sessionId: input.sessionId,
        reason: "max_duration",
        reply: async (content) => {
          if (params.sendChannelMessage) {
            await params.sendChannelMessage(input.channelId, content);
          }
        },
      }).catch((error) => console.error("Local auto-stop failed", error));
    }, delay);
    autoStopTimers.set(input.guildId, { sessionId: input.sessionId, timer });
  };

  const handleStop = async (ctx: CommandContext, intent: CommandIntent) => {
    if (intent.type !== "stop") return;
    const reason = intent.reason ?? "manual_command";
    const sessionId = transcription.getSessionId(ctx.guildId);
    if (!sessionId) {
      // A bot restart wipes the in-memory session map; fall back to the DB
      // record so an active session can still be stopped.
      try {
        voice.stopListening(ctx.guildId);
        const result = await api.stopActiveSessionForGuild({
          guildId: ctx.guildId,
          reason,
        });
        await ctx.reply(
          result.stopped
            ? "🛑 Session ended. Summarizing..."
            : "No recording is currently active.",
        );
      } catch (error) {
        console.error("Session stop failed", error);
        await ctx.reply(
          "❌ Could not stop the session cleanly. Please try again.",
        );
      }
      return;
    }

    try {
      await stopSession({
        guildId: ctx.guildId,
        sessionId,
        reason,
        reply: ctx.reply,
      });
    } catch (error) {
      console.error("Session stop failed", error);
      await ctx.reply(
        "❌ Could not stop the session cleanly. Please try again.",
      );
    }
  };

  const handleRecap = async (ctx: CommandContext) => {
    if (!ctx.voiceChannelId) {
      await ctx.reply("Join a voice channel so I can speak the recap.");
      return;
    }

    // Reuse handleAgent logic but with a specific prompt
    // Note: We construct a fake 'agent' intent to reuse the logic
    await handleAgent(ctx, {
      type: "agent",
      message:
        "Please provide a dramatic, narrated recap of the previous session for the voice channel. Use the 'say' tool.",
    });
  };

  const handleScene = async (ctx: CommandContext, intent: CommandIntent) => {
    if (intent.type !== "scene") return;
    await handleAgent(ctx, {
      type: "agent",
      message: `Please illustrate this scene: ${intent.prompt}`,
    });
  };

  const handleSay = async (ctx: CommandContext, intent: CommandIntent) => {
    if (intent.type !== "say") return;

    if (!intent.text) {
      await ctx.reply("Usage: `/grim say` with a text prompt.");
      return;
    }

    if (!ctx.voiceChannelId) {
      await ctx.reply("Join a voice channel so I can speak.");
      return;
    }

    const voiceConfig = buildVoiceConfig(config, intent.voiceOverride);

    try {
      await voice.speak({
        guildId: ctx.guildId,
        voiceChannelId: ctx.voiceChannelId,
        text: intent.text,
        voice: voiceConfig,
        shouldDisconnect: !transcription.hasSession(ctx.guildId),
      });
    } catch (error) {
      console.error("TTS failed", error);
      await ctx.reply("❌ TTS failed. Check logs and provider config.");
    }
  };

  const handleAgent = async (ctx: CommandContext, intent: CommandIntent) => {
    if (intent.type !== "agent") return;

    let actions: AgentAction[];
    try {
      actions = await api.runAgent({
        guildId: ctx.guildId,
        channelId: ctx.channelId,
        userId: ctx.userId,
        userName: ctx.userName,
        userDisplayName: ctx.userDisplayName,
        canManageGuild: ctx.canManageGuild,
        message: intent.message,
      });
    } catch (error) {
      console.error("Agent request failed", error);
      await ctx.reply("❌ Agent request failed. Check the API.");
      return;
    }

    for (const action of actions) {
      if (action.type === "reply") {
        await ctx.reply(action.content);
        continue;
      }

      if (action.type === "image") {
        const ext = action.mimeType === "image/png" ? "png" : "jpg";
        const buffer = Buffer.from(action.base64, "base64");
        await ctx.replyWithImage({
          buffer,
          filename: `scene.${ext}`,
          caption: action.caption,
        });
        continue;
      }

      if (action.type === "say") {
        try {
          if (ctx.voiceChannelId) {
            const voiceConfig = buildVoiceConfig(config, action.voice);
            await voice.speak({
              guildId: ctx.guildId,
              voiceChannelId: ctx.voiceChannelId,
              text: action.text,
              voice: voiceConfig,
              shouldDisconnect: !transcription.hasSession(ctx.guildId),
            });
          } else {
            await ctx.reply(action.text);
          }
        } catch (error) {
          console.error("Agent TTS action failed", error);
          await ctx.reply(
            "❌ TTS failed. Check Discord voice connection and logs.",
          );
          return;
        }
      }
    }
  };

  const handleHelp = async (ctx: CommandContext) => {
    await ctx.reply(HELP_MESSAGE);
  };

  const handleCampaignCreate = async (
    ctx: CommandContext,
    name: string,
    description?: string,
  ) => {
    try {
      const campaign = await api.createCampaign({
        guildId: ctx.guildId,
        name,
        description,
      });
      await ctx.reply(
        `✅ Created campaign **${campaign.name}**. It is now active.`,
      );
    } catch (error) {
      console.error("Campaign create failed", error);
      await ctx.reply("❌ Failed to create campaign.");
    }
  };

  const handleCampaignList = async (ctx: CommandContext) => {
    try {
      const { campaigns, activeCampaignId } = await api.listCampaigns(
        ctx.guildId,
      );
      if (campaigns.length === 0) {
        await ctx.reply("No campaigns found.");
        return;
      }

      const list = campaigns
        .map((c) => {
          const active = c.id === activeCampaignId ? " (Active) 🌟" : "";
          return `- **${c.name}**${active}: ${c.description || "No description"}`;
        })
        .join("\n");

      await ctx.reply(`**Campaigns:**\n${list}`);
    } catch (error) {
      console.error("Campaign list failed", error);
      await ctx.reply("❌ Failed to list campaigns.");
    }
  };

  const handleCampaignSelect = async (ctx: CommandContext, name: string) => {
    try {
      const campaign = await api.setActiveCampaign({
        guildId: ctx.guildId,
        name,
      });
      await ctx.reply(`✅ Active campaign set to **${campaign.name}**.`);
    } catch (error) {
      console.error("Campaign select failed", error);
      await ctx.reply("❌ Failed to select campaign. Ensure it exists.");
    }
  };

  const requireSchedulePermission = async (ctx: CommandContext) => {
    if (ctx.canManageGuild) return true;
    await ctx.reply(
      "Only members with Manage Server permission can change the game schedule.",
    );
    return false;
  };

  const handleScheduleSet = async (
    ctx: CommandContext,
    intent: Extract<CommandIntent, { type: "schedule_set" }>,
  ) => {
    if (!(await requireSchedulePermission(ctx))) return;
    try {
      const schedule = await api.setCampaignSchedule({
        guildId: ctx.guildId,
        announcementChannelId: ctx.channelId,
        createdByDiscordUserId: ctx.userId,
        weekday: intent.weekday,
        localTime: intent.localTime,
        timeZone: intent.timeZone,
      });
      const timestamp = Math.floor(
        new Date(schedule.nextOccurrenceAt).getTime() / 1000,
      );
      await ctx.reply(
        `✅ Game reminder scheduled for <t:${timestamp}:F> (<t:${timestamp}:R>) in **${schedule.timeZone}**.`,
      );
    } catch (error) {
      console.error("Schedule set failed", error);
      await ctx.reply(
        `❌ Could not save that schedule: ${error instanceof Error ? error.message : "invalid schedule"}`,
      );
    }
  };

  const handleScheduleShow = async (ctx: CommandContext) => {
    try {
      const schedule = await api.getCampaignSchedule(ctx.guildId);
      if (!schedule) {
        await ctx.reply("No game time is scheduled for the active campaign.");
        return;
      }
      const timestamp = Math.floor(
        new Date(schedule.nextOccurrenceAt).getTime() / 1000,
      );
      await ctx.reply(
        `🎲 The next game reminder is <t:${timestamp}:F> (<t:${timestamp}:R>) in <#${schedule.announcementChannelId}>.`,
      );
    } catch (error) {
      console.error("Schedule lookup failed", error);
      await ctx.reply("❌ Could not read the campaign schedule.");
    }
  };

  const handleScheduleRemove = async (ctx: CommandContext) => {
    if (!(await requireSchedulePermission(ctx))) return;
    try {
      const removed = await api.removeCampaignSchedule(ctx.guildId);
      await ctx.reply(
        removed
          ? "✅ Removed the active campaign's game reminder."
          : "No game reminder was configured.",
      );
    } catch (error) {
      console.error("Schedule removal failed", error);
      await ctx.reply("❌ Could not remove the campaign schedule.");
    }
  };

  const handleIntent = async (intent: CommandIntent, ctx: CommandContext) => {
    if (intent.type === "help") {
      await handleHelp(ctx);
      return;
    }

    if (intent.type === "start") {
      await handleStart(ctx);
      return;
    }

    if (intent.type === "stop") {
      await handleStop(ctx, intent);
      return;
    }

    if (intent.type === "recap") {
      await handleRecap(ctx);
      return;
    }

    if (intent.type === "say") {
      await handleSay(ctx, intent);
      return;
    }

    if (intent.type === "scene") {
      await handleScene(ctx, intent);
      return;
    }

    if (intent.type === "campaign_create") {
      await handleCampaignCreate(ctx, intent.name, intent.description);
      return;
    }

    if (intent.type === "campaign_list") {
      await handleCampaignList(ctx);
      return;
    }

    if (intent.type === "campaign_select") {
      await handleCampaignSelect(ctx, intent.name);
      return;
    }

    if (intent.type === "schedule_set") {
      await handleScheduleSet(ctx, intent);
      return;
    }

    if (intent.type === "schedule_show") {
      await handleScheduleShow(ctx);
      return;
    }

    if (intent.type === "schedule_remove") {
      await handleScheduleRemove(ctx);
      return;
    }

    await handleAgent(ctx, intent);
  };

  const stopSessionById: BotController["stopSessionById"] = async (params) => {
    const { session } = await api.getSessionState(params.sessionId);
    if (session.guildId !== params.guildId) {
      await params.reply("That stop button does not belong to this server.");
      return;
    }
    if (session.status !== "active") {
      await params.reply("That recording has already ended.");
      return;
    }
    await stopSession({
      guildId: params.guildId,
      sessionId: params.sessionId,
      reason: params.reason,
      reply: params.reply,
    });
  };

  const handleStartReminder: BotController["handleStartReminder"] = async (
    jobId,
    ctx,
  ) => {
    try {
      if (!(await api.isStartReminderValid(jobId, ctx.guildId))) {
        await ctx.reply(
          "That game-time button has expired. Use `/grim start` to record now.",
        );
        return;
      }
      await handleStart(ctx);
    } catch (error) {
      console.error("Start reminder validation failed", error);
      await ctx.reply("❌ Could not validate that game reminder.");
    }
  };

  return { handleIntent, handleStartReminder, stopSessionById };
}
