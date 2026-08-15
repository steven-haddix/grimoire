import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { createBotApi } from "./api/bot-api";
import { loadConfig } from "./config";
import { createCommandRouter } from "./discord/commands";
import { registerDiscordEvents } from "./discord/events";
import { registerSlashCommands } from "./discord/slash-commands";
import { createVoiceManager } from "./discord/voice-manager";
import { createScheduler } from "./scheduling/scheduler";
import { startBotHttpServer } from "./server/http";
import { createBotController } from "./services/bot-controller";
import { SttService } from "./services/stt-service";
import { TranscriptionService } from "./services/transcription-service";
import { TtsService } from "./services/tts-service";
import { createSttProviderFromEnv } from "./stt";
import { createAllTtsProvidersFromEnv } from "./tts";
import { VoicePersonaManager } from "./tts/voice-personas";

const DEFAULT_STT_CONFIG = {
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

const personaManager = new VoicePersonaManager();
const tts = new TtsService(personaManager);
for (const provider of createAllTtsProvidersFromEnv(process.env)) {
  tts.registerProvider(provider);
}

const transcription = new TranscriptionService(
  stt,
  { ingest: api.ingestTranscript },
  (userId, guildId) => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return client.users.cache.get(userId)?.username;
    const member = guild.members.cache.get(userId);
    return member?.displayName ?? member?.user.username ?? "Unknown";
  },
);
const voice = createVoiceManager({ client, tts, transcription });
const controller = createBotController({
  config,
  api,
  voice,
  transcription,
  sendChannelMessage: async (channelId, content) => {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable()) {
      throw new Error(`Discord channel ${channelId} is not sendable`);
    }
    await channel.send({ content });
  },
});
const commands = createCommandRouter({ controller });
const scheduler = createScheduler({ client, api, controller });

registerDiscordEvents({ client, api, commands });
registerSlashCommands(config).catch((err) => {
  console.error("Slash command registration failed", err);
});
const server = startBotHttpServer({ config, client, scheduler });

const shutdown = () => {
  scheduler.stop();
  void server.stop();
  // The HTTP server keeps the event loop alive, so exit explicitly once the
  // Discord client is down instead of waiting for Docker's SIGKILL.
  Promise.resolve(client.destroy())
    .catch(() => {})
    .finally(() => process.exit(0));
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

client
  .login(config.discordToken)
  .then(() => scheduler.start())
  .catch((error) => {
    console.error("Discord login failed", error);
    // Exit so the container restart policy retries; the live HTTP server
    // would otherwise keep a dead bot running and reporting healthy.
    process.exit(1);
  });
