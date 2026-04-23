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

function describeConnection(connection: VoiceConnection) {
  const channelId =
    typeof connection.joinConfig.channelId === "string"
      ? connection.joinConfig.channelId
      : "unknown";

  return `state=${connection.state.status} channel=${channelId}`;
}

export function createVoiceManager(
  params: {
    client: Client;
    tts: TtsService;
    transcription: TranscriptionService;
  },
  deps = {
    entersState,
    getGuildSpeechQueue,
    getVoiceConnection,
    joinVoiceChannel,
    removeGuildSpeechQueue,
  },
): VoiceGateway {
  const { client, tts, transcription } = params;
  const attachedReceivers = new Set<string>();

  const joinVoice = (input: { guildId: string; channelId: string }) =>
    deps.joinVoiceChannel({
      channelId: input.channelId,
      guildId: input.guildId,
      adapterCreator: getAdapterCreator(client, input.guildId),
      selfDeaf: false,
      // Discord voice requires DAVE/E2EE as of 2026-03-01.
      daveEncryption: true,
    });

  const ensureReady = async (connection: VoiceConnection) => {
    try {
      await deps.entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      return connection;
    } catch (error) {
      throw new Error(
        `Voice connection failed to become ready (${describeConnection(connection)})`,
        { cause: error },
      );
    }
  };

  const getReadyConnection = async (input: {
    guildId: string;
    channelId: string;
  }) => {
    const existing = deps.getVoiceConnection(input.guildId);
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
    deps.removeGuildSpeechQueue(guildId);
    attachedReceivers.delete(guildId);
  };

  const handleDisconnect = async (
    connection: VoiceConnection,
    guildId: string,
  ) => {
    try {
      await Promise.race([
        deps.entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        deps.entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      // Reconnecting (channel move / transient blip) — leave it alone.
      return;
    } catch {
      // Unrecoverable: tear down local resources but leave the DB session
      // 'active' so a follow-up /grim start resumes it.
      console.warn(
        `Voice connection for guild ${guildId} dropped; cleaning up without summarize.`,
      );
    }

    try {
      cleanupGuildConnection(guildId, connection);
      await transcription.clearSession(guildId);
    } catch (error) {
      console.error(
        `Error during voice disconnect cleanup for guild ${guildId}:`,
        error,
      );
    }
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

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      void handleDisconnect(connection, guildId);
    });

    connection.on("error", (err) => {
      console.error(`Voice connection error for guild ${guildId}:`, err);
    });
  };

  return {
    isConnected: (guildId: string) => Boolean(deps.getVoiceConnection(guildId)),
    startListening: async ({ guildId, channelId }) => {
      const connection = await getReadyConnection({ guildId, channelId });
      attachReceiver(connection, guildId);
      deps.getGuildSpeechQueue({ guildId, connection, tts });
    },
    stopListening: (guildId: string) => {
      const connection = deps.getVoiceConnection(guildId);
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
      const queue = deps.getGuildSpeechQueue({ guildId, connection, tts });
      await queue.speak(text, voice);

      if (shouldDisconnect && !transcription.hasSession(guildId)) {
        cleanupGuildConnection(guildId, connection);
      }
    },
  };
}
