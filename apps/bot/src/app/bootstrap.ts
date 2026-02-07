import { createRuntimeDb } from "@grimoire/data/client";
import { ingestTranscript } from "@grimoire/data/repos/transcripts";
import { Client, GatewayIntentBits } from "discord.js";
import { createAgent } from "../agent/agent";
import { loadConfig } from "../config";
import { createCommandRouter } from "../discord/commands";
import { registerDiscordEvents } from "../discord/events";
import { registerSlashCommands } from "../discord/slash-commands";
import { createVoiceManager } from "../discord/voice-manager";
import { startBotHttpServer } from "../server/http";
import { createBotController } from "../services/bot-controller";
import { createGuildPresenceService } from "../services/guild-presence-service";
import { createSessionLifecycle } from "../services/session-lifecycle";
import { createSessionSummarizer } from "../services/session-summarizer";
import { SttService } from "../services/stt-service";
import { TranscriptionService } from "../services/transcription-service";
import { TtsService } from "../services/tts-service";
import { createSttProviderFromEnv } from "../stt";
import { createAllTtsProvidersFromEnv } from "../tts";
import { VoicePersonaManager } from "../tts/voice-personas";

const DEFAULT_STT_CONFIG = {
  model: "nova-3",
  smartFormat: true,
  encoding: "opus",
  sampleRate: 48000,
  channels: 2,
  language: "en-US",
};

export function bootstrap() {
  const config = loadConfig(process.env);
  const db = createRuntimeDb(config.databaseUrl);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const stt = new SttService(
    createSttProviderFromEnv(process.env),
    DEFAULT_STT_CONFIG,
  );

  const personaManager = new VoicePersonaManager();
  const tts = new TtsService(personaManager);
  createAllTtsProvidersFromEnv(process.env).forEach((provider) => {
    tts.registerProvider(provider);
  });

  const transcription = new TranscriptionService(
    stt,
    {
      ingest: async (input) => {
        await ingestTranscript(db, input);
      },
    },
    (userId, guildId) => {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return client.users.cache.get(userId)?.username;
      const member = guild.members.cache.get(userId);
      return member?.displayName ?? member?.user.username ?? "Unknown";
    },
  );

  const voice = createVoiceManager({ client, tts, transcription });
  const sessionLifecycle = createSessionLifecycle({
    db,
    summarizer: createSessionSummarizer(),
  });
  const agent = createAgent({ db });
  const guildPresence = createGuildPresenceService(db);

  const controller = createBotController({
    config,
    db,
    voice,
    transcription,
    sessionLifecycle,
    agent,
  });
  const commands = createCommandRouter({ controller });

  registerDiscordEvents({
    client,
    guildPresence,
    commands,
  });

  registerSlashCommands(config).catch((error) => {
    console.error("Slash command registration failed", error);
  });

  startBotHttpServer({ config, client });

  client.login(config.discordToken);

  return {
    client,
    config,
  };
}
