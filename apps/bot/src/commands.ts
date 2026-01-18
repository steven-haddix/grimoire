import { getVoiceConnection } from "@discordjs/voice";
import type { Message } from "discord.js";
import type { BotApi } from "./api";
import type { BotConfig } from "./config";
import { getGuildSpeechQueue, type TtsService, type TtsVoiceConfig } from "./tts";
import type { VoiceManager } from "./voice";

const PREFIX = "!scribe";
const HELP_MESSAGE = "Ask me about the session or say `!scribe start`.";

function buildVoiceConfig(
  config: BotConfig,
  voiceOverride?: string,
): TtsVoiceConfig {
  return {
    voice: voiceOverride ?? config.ttsVoice,
    options: config.ttsVoiceOptions,
  };
}

function parseSayArgs(args: string[], config: BotConfig) {
  if (args.length === 0) {
    return { text: "", voice: buildVoiceConfig(config) };
  }

  if (args[0] === "--voice" && args[1]) {
    const voice = args[1];
    const text = args.slice(2).join(" ").trim();
    return { text, voice: buildVoiceConfig(config, voice) };
  }

  return { text: args.join(" ").trim(), voice: buildVoiceConfig(config) };
}

export type CommandRouter = {
  handleMessage: (msg: Message) => Promise<void>;
};

export function createCommandRouter(params: {
  config: BotConfig;
  api: BotApi;
  voice: VoiceManager;
  tts: TtsService;
}): CommandRouter {
  const { config, api, voice, tts } = params;

  const handleStart = async (msg: Message<true>) => {
    if (!msg.member?.voice.channel) {
      await msg.reply("Join a voice channel first.");
      return;
    }

    const existingConnection = getVoiceConnection(msg.guild.id);
    if (existingConnection) {
      await msg.reply("🟡 Already listening here. Use `!scribe stop` first.");
      return;
    }

    const channel = msg.member.voice.channel;
    const connection = voice.joinVoice({
      channelId: channel.id,
      guildId: msg.guild.id,
      adapterCreator: msg.guild.voiceAdapterCreator,
    });

    getGuildSpeechQueue({ guildId: msg.guild.id, connection, tts });

    try {
      const sessionId = await api.startSession({
        guildId: msg.guild.id,
        channelId: channel.id,
      });

      voice.setSessionId(msg.guild.id, sessionId);
      voice.attachReceiver(connection, msg.guild.id);

      await msg.reply(
        `📜 **Session #${sessionId} Started.** I am listening...`,
      );
    } catch (error) {
      console.error(error);
      voice.cleanupGuildConnection(msg.guild.id, connection);
      await msg.reply("❌ Could not start session. Check the API.");
    }
  };

  const handleStop = async (msg: Message<true>) => {
    const connection = getVoiceConnection(msg.guild.id);
    const sessionId = voice.getSessionId(msg.guild.id);

    if (connection) {
      voice.cleanupGuildConnection(msg.guild.id, connection);
    } else if (sessionId) {
      voice.cleanupGuildConnection(msg.guild.id);
    }

    if (sessionId) {
      await msg.reply("🛑 Session ended. Summarizing...");

      api
        .summarizeSession(sessionId)
        .catch((err) => console.error("Summarize failed", err));

      voice.clearSession(msg.guild.id);
    }
  };

  const handleSay = async (msg: Message<true>, args: string[]) => {
    const speakContext = await voice.getOrJoinVoiceForSay(msg);
    if (!speakContext) return;

    const { text, voice: voiceConfig } = parseSayArgs(args, config);
    if (!text) {
      await msg.reply(
        "Usage: `!scribe say <text>` or `!scribe say --voice <id> <text>`",
      );
      return;
    }

    const queue = getGuildSpeechQueue({
      guildId: msg.guild.id,
      connection: speakContext.connection,
      tts,
    });

    try {
      await queue.speak(text, voiceConfig);
      if (speakContext.shouldDisconnect) {
        voice.cleanupGuildConnection(msg.guild.id, speakContext.connection);
      }
    } catch (error) {
      console.error("TTS failed", error);
      await msg.reply("❌ TTS failed. Check logs and provider config.");
    }
  };

  const handleAgent = async (msg: Message<true>, message: string) => {
    try {
      const actions = await api.runAgent({
        guildId: msg.guild.id,
        channelId: msg.channel.id,
        userId: msg.author.id,
        userName: msg.author.username,
        message,
      });

      for (const action of actions) {
        if (action.type === "reply") {
          await msg.reply(action.content);
          continue;
        }

        if (action.type === "say") {
          const speakContext = await voice.getOrJoinVoiceForSay(msg);
          if (!speakContext) continue;

          const queue = getGuildSpeechQueue({
            guildId: msg.guild.id,
            connection: speakContext.connection,
            tts,
          });

          try {
            await queue.speak(
              action.text,
              buildVoiceConfig(config, action.voice),
            );
            if (speakContext.shouldDisconnect) {
              voice.cleanupGuildConnection(msg.guild.id, speakContext.connection);
            }
          } catch (error) {
            console.error("Agent TTS failed", error);
            await msg.reply("❌ TTS failed. Check logs and provider config.");
          }
        }
      }
    } catch (error) {
      console.error("Agent request failed", error);
      await msg.reply("❌ Agent request failed. Check the API.");
    }
  };

  const handleMessage = async (msg: Message) => {
    if (!msg.inGuild() || msg.author.bot) return;

    const content = msg.content.trim();
    if (!content.startsWith(PREFIX)) return;

    const afterPrefix = content.slice(PREFIX.length).trim();
    if (!afterPrefix) {
      await msg.reply(HELP_MESSAGE);
      return;
    }

    const [command, ...args] = afterPrefix.split(/\s+/);

    if (command === "start") {
      await handleStart(msg);
      return;
    }

    if (command === "stop") {
      await handleStop(msg);
      return;
    }

    if (command === "say") {
      await handleSay(msg, args);
      return;
    }

    await handleAgent(msg, afterPrefix);
  };

  return { handleMessage };
}
