import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { createBotApi } from "./api/bot-api";
import { loadConfig } from "./config";
import { createCommandRouter } from "./discord/commands";
import { registerDiscordEvents } from "./discord/events";
import { registerSlashCommands } from "./discord/slash-commands";
import { createVoiceManager } from "./discord/voice-manager";
import { createBotController } from "./services/bot-controller";
import { SttService } from "./services/stt-service";
import { TranscriptionService } from "./services/transcription-service";
import { TtsService } from "./services/tts-service";
import { startBotHttpServer } from "./server/http";
import { createSttProviderFromEnv } from "./stt";
import { createTtsProviderFromEnv } from "./tts";

const DEFAULT_STT_CONFIG = {
  model: "nova-3",
  smartFormat: true,
  encoding: "opus",
  sampleRate: 48000,
  channels: 2,
  language: "en-US",
};

const config = loadConfig(process.env);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const api = createBotApi(config);
const stt = new SttService(
  createSttProviderFromEnv(process.env),
  DEFAULT_STT_CONFIG,
);
const tts = new TtsService(createTtsProviderFromEnv(process.env));
const transcription = new TranscriptionService(
  stt,
  { ingest: api.ingestTranscript },
  (userId) => client.users.cache.get(userId)?.username,
);
const voice = createVoiceManager({ client, tts, transcription });
const controller = createBotController({ config, api, voice, transcription });
const commands = createCommandRouter({ controller });

registerDiscordEvents({ client, api, commands });
registerSlashCommands(config).catch((err) => {
  console.error("Slash command registration failed", err);
});
startBotHttpServer({ config, client });

client.login(config.discordToken);
