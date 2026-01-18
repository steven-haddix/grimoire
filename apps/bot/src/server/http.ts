import type { Client } from "discord.js";
import type { BotConfig } from "../config";

async function isBotInstalled(client: Client, guildId: string) {
  try {
    await client.guilds.fetch(guildId);
    return true;
  } catch {
    return false;
  }
}

export function startBotHttpServer(params: {
  config: BotConfig;
  client: Client;
}) {
  const { config, client } = params;

  return Bun.serve({
    port: config.botHttpPort,
    async fetch(req) {
      const url = new URL(req.url);
      const match = url.pathname.match(/^\/guilds\/([^/]+)\/installed$/);

      if (req.method !== "GET" || !match) {
        return new Response("Not Found", { status: 404 });
      }

      if (req.headers.get("x-bot-secret") !== config.botSecret) {
        return new Response("Unauthorized", { status: 401 });
      }

      if (!client.isReady()) {
        return new Response("Bot not ready", { status: 503 });
      }

      const guildId = match[1];
      if (!guildId) {
        return new Response("Bad Request", { status: 400 });
      }

      const installed = await isBotInstalled(client, guildId);

      return new Response(JSON.stringify({ installed }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
}
