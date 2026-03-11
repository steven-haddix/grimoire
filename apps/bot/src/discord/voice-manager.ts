import {
  type DiscordGatewayAdapterCreator,
  EndBehaviorType,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Client } from "discord.js";
import type { TranscriptionService } from "../services/transcription-service";
import type { TtsService } from "../services/tts-service";
import type { VoiceGateway } from "../types";
import { getGuildSpeechQueue, removeGuildSpeechQueue } from "./audio-output";

function getAdapterCreator(
  client: Client,
  guildId: string,
): DiscordGatewayAdapterCreator {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Guild not found for voice connect: ${guildId}`);
  }
  return guild.voiceAdapterCreator;
}

export function createVoiceManager(params: {
  client: Client;
  tts: TtsService;
  transcription: TranscriptionService;
}): VoiceGateway {
  const { client, tts, transcription } = params;
  const attachedReceivers = new Set<string>();

  const joinVoice = (input: { guildId: string; channelId: string }) =>
    joinVoiceChannel({
      channelId: input.channelId,
      guildId: input.guildId,
      adapterCreator: getAdapterCreator(client, input.guildId),
      selfDeaf: false,
      daveEncryption: false,
    });

  const ensureReady = async (connection: VoiceConnection) => {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    return connection;
  };

  const getReadyConnection = async (input: {
    guildId: string;
    channelId: string;
  }) => {
    const existing = getVoiceConnection(input.guildId);
    const existingChannelId =
      typeof existing?.joinConfig.channelId === "string"
        ? existing.joinConfig.channelId
        : undefined;

    if (existing) {
      const isReusableStatus =
        existing.state.status !== VoiceConnectionStatus.Destroyed &&
        existing.state.status !== VoiceConnectionStatus.Disconnected;

      if (isReusableStatus && existingChannelId === input.channelId) {
        try {
          return await ensureReady(existing);
        } catch (error) {
          console.warn(
            `Existing voice connection for guild ${input.guildId} was not ready; recreating it.`,
            error,
          );
        }
      }

      try {
        existing.destroy();
      } catch {}
    }

    return await ensureReady(joinVoice(input));
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
    attachedReceivers.delete(guildId);
  };

  const attachReceiver = (connection: VoiceConnection, guildId: string) => {
    if (attachedReceivers.has(guildId)) return;
    attachedReceivers.add(guildId);

    connection.receiver.speaking.on("start", (userId) => {
      const stream = connection.receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
      });

      transcription.handleUserStream({
        guildId,
        userId,
        stream,
      });
    });
  };

  return {
    isConnected: (guildId: string) => Boolean(getVoiceConnection(guildId)),
    startListening: async ({ guildId, channelId }) => {
      const connection = await getReadyConnection({ guildId, channelId });
      attachReceiver(connection, guildId);
      getGuildSpeechQueue({ guildId, connection, tts });
    },
    stopListening: (guildId: string) => {
      const connection = getVoiceConnection(guildId);
      if (connection) {
        cleanupGuildConnection(guildId, connection);
      } else {
        cleanupGuildConnection(guildId);
      }
    },
    speak: async ({
      guildId,
      voiceChannelId,
      text,
      voice,
      shouldDisconnect,
    }) => {
      const connection = await getReadyConnection({
        guildId,
        channelId: voiceChannelId,
      });
      const queue = getGuildSpeechQueue({ guildId, connection, tts });
      await queue.speak(text, voice);

      if (shouldDisconnect && !transcription.hasSession(guildId)) {
        cleanupGuildConnection(guildId, connection);
      }
    },
  };
}
