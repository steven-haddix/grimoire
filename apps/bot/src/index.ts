import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { createBotApi } from "./api";
import { createCommandRouter } from "./commands";
import { loadConfig } from "./config";
import { registerDiscordEvents } from "./events";
import { startBotHttpServer } from "./server";
import { createSttProviderFromEnv } from "./stt";
import { TtsService, createTtsProviderFromEnv } from "./tts";
import { createVoiceManager } from "./voice";

const config = loadConfig(process.env);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const tts = new TtsService(createTtsProviderFromEnv(process.env));
const stt = createSttProviderFromEnv(process.env);
const api = createBotApi(config);
const voice = createVoiceManager({ client, api, stt, tts });
const commands = createCommandRouter({ config, api, voice, tts });

registerDiscordEvents({ client, api, commands });
startBotHttpServer({ config, client });

client.login(config.discordToken);
