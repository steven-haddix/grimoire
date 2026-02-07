import type { Client } from "discord.js";
import type { BotConfig } from "../config";

export function startBotHttpServer(params: {
  config: BotConfig;
  client: Client;
}) {
  const { config, client } = params;

  return Bun.serve({
    port: config.botHttpPort,
    fetch(req) {
      const url = new URL(req.url);

      if (req.method !== "GET") {
        return new Response("Not Found", { status: 404 });
      }

      if (url.pathname === "/healthz") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/readyz") {
        if (!client.isReady()) {
          return new Response(JSON.stringify({ ready: false }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ready: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}
