import {
  type DiscordGatewayAdapterCreator,
  EndBehaviorType,
  getVoiceConnection,
  joinVoiceChannel,
  type VoiceConnection,
} from "@discordjs/voice";
import type { Client, Message } from "discord.js";
import type { BotApi } from "./api";
import type { SttProvider, SttStream } from "./stt";
import {
  getGuildSpeechQueue,
  removeGuildSpeechQueue,
  type TtsService,
} from "./tts";

export type SpeakContext = {
  connection: VoiceConnection;
  shouldDisconnect: boolean;
};

const DEFAULT_STT_CONFIG = {
  model: "nova-3",
  smartFormat: true,
  encoding: "opus",
  sampleRate: 48000,
  channels: 2,
  language: "en-US",
};

export function createVoiceManager(params: {
  client: Client;
  api: BotApi;
  stt: SttProvider;
  tts: TtsService;
}) {
  const { client, api, stt, tts } = params;
  const sessionMap = new Map<string, number>();
  const activeUserStreams = new Set<string>();

  const joinVoice = (input: {
    guildId: string;
    channelId: string;
    adapterCreator: DiscordGatewayAdapterCreator;
  }) =>
    joinVoiceChannel({
      channelId: input.channelId,
      guildId: input.guildId,
      adapterCreator: input.adapterCreator,
      selfDeaf: false,
      daveEncryption: false,
    });

  const clearActiveStreams = (guildId: string) => {
    for (const key of activeUserStreams) {
      if (key.startsWith(`${guildId}:`)) {
        activeUserStreams.delete(key);
      }
    }
  };

  const cleanupGuildConnection = (
    guildId: string,
    connection?: VoiceConnection,
  ) => {
    if (connection) {
      try {
        connection.destroy();
      } catch {}
    }
    removeGuildSpeechQueue(guildId);
    clearActiveStreams(guildId);
  };

  const attachReceiver = (connection: VoiceConnection, guildId: string) => {
    connection.receiver.speaking.on("start", (userId) => {
      const sessionId = sessionMap.get(guildId);
      if (!sessionId) return;

      const streamKey = `${guildId}:${userId}`;
      if (activeUserStreams.has(streamKey)) return;

      activeUserStreams.add(streamKey);
      processStream(connection, userId, sessionId, streamKey);
    });
  };

  function processStream(
    connection: VoiceConnection,
    userId: string,
    sessionId: number,
    streamKey: string,
  ) {
    const opusStream = connection.receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
    });

    let cleanedUp = false;
    let sttStream: SttStream | null = null;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      activeUserStreams.delete(streamKey);
      try {
        opusStream.destroy();
      } catch {}
      try {
        sttStream?.close();
      } catch {}
    };

    // biome-ignore lint/suspicious/noExplicitAny: data comes from Discord receiver
    const onData = (chunk: any) => {
      try {
        sttStream?.send(chunk);
      } catch (err) {
        console.error("STT send failed", err);
        cleanup();
      }
    };

    sttStream = stt.createStream(DEFAULT_STT_CONFIG, {
      onOpen: () => {
        opusStream.on("data", onData);
        opusStream.once("end", cleanup);
        opusStream.once("error", (err) => {
          console.error("Opus stream error", err);
          cleanup();
        });
      },
      onTranscript: (result) => {
        if (!result.isFinal) return;
        const text = result.text.trim();
        if (!text) return;

        const user = client.users.cache.get(userId);
        api
          .ingestTranscript({
            sessionId,
            speaker: user?.username ?? "Unknown",
            text,
            timestamp: new Date().toISOString(),
          })
          .catch((err) => console.error("Ingest failed", err));
      },
      onError: (error) => {
        console.error("STT error", error);
        cleanup();
      },
      onClose: cleanup,
    });
  }

  const getOrJoinVoiceForSay = async (
    msg: Message<true>,
  ): Promise<SpeakContext | null> => {
    const existing = getVoiceConnection(msg.guild.id);
    if (existing) {
      return { connection: existing, shouldDisconnect: false };
    }

    const channel = msg.member?.voice.channel;
    if (!channel) {
      await msg.reply("Join a voice channel so I can speak.");
      return null;
    }

    const connection = joinVoice({
      channelId: channel.id,
      guildId: msg.guild.id,
      adapterCreator: msg.guild.voiceAdapterCreator,
    });

    getGuildSpeechQueue({ guildId: msg.guild.id, connection, tts });

    const shouldDisconnect = !sessionMap.has(msg.guild.id);
    return { connection, shouldDisconnect };
  };

  return {
    joinVoice,
    attachReceiver,
    cleanupGuildConnection,
    clearSession: (guildId: string) => sessionMap.delete(guildId),
    getSessionId: (guildId: string) => sessionMap.get(guildId),
    hasSession: (guildId: string) => sessionMap.has(guildId),
    setSessionId: (guildId: string, sessionId: number) =>
      sessionMap.set(guildId, sessionId),
    getOrJoinVoiceForSay,
  };
}

export type VoiceManager = ReturnType<typeof createVoiceManager>;
