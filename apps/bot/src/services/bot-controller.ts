import type { BotApi } from "../api/bot-api";
import type { BotConfig } from "../config";
import type { TtsVoiceConfig } from "../tts/types";
import type { CommandContext, CommandIntent, VoiceGateway } from "../types";
import type { TranscriptionService } from "./transcription-service";

export type BotController = {
  handleIntent: (intent: CommandIntent, ctx: CommandContext) => Promise<void>;
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
}): BotController {
  const { config, api, voice, transcription } = params;

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
      const sessionId = await api.startSession({
        guildId: ctx.guildId,
        channelId: ctx.voiceChannelId,
      });

      transcription.setSessionId(ctx.guildId, sessionId);

      await ctx.reply(
        `📜 **Session #${sessionId} Started.** I am listening...`,
      );
    } catch (error) {
      console.error(error);
      voice.stopListening(ctx.guildId);
      await ctx.reply("❌ Could not start session. Check the API.");
    }
  };

  const handleStop = async (ctx: CommandContext) => {
    const sessionId = transcription.getSessionId(ctx.guildId);
    voice.stopListening(ctx.guildId);

    if (sessionId) {
      await ctx.reply("🛑 Session ended. Summarizing...");

      api
        .summarizeSession(sessionId)
        .catch((err) => console.error("Summarize failed", err));

      transcription.clearSession(ctx.guildId);
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

    try {
      const actions = await api.runAgent({
        guildId: ctx.guildId,
        channelId: ctx.channelId,
        userId: ctx.userId,
        userName: ctx.userName,
        message: intent.message,
      });

      for (const action of actions) {
        if (action.type === "reply") {
          await ctx.reply(action.content);
          continue;
        }

        if (action.type === "say") {
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
        }
      }
    } catch (error) {
      console.error("Agent request failed", error);
      await ctx.reply("❌ Agent request failed. Check the API.");
    }
  };

  const handleHelp = async (ctx: CommandContext) => {
    await ctx.reply(HELP_MESSAGE);
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
      await handleStop(ctx);
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

    await handleAgent(ctx, intent);
  };

  return { handleIntent };
}
