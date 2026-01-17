import "dotenv/config";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import {
  EndBehaviorType,
  getVoiceConnection,
  joinVoiceChannel,
} from "@discordjs/voice";
import { Client, Events, GatewayIntentBits } from "discord.js";

const { DISCORD_TOKEN, DEEPGRAM_API_KEY, NEXT_API_URL, BOT_SECRET } =
  process.env;

if (!DISCORD_TOKEN || !DEEPGRAM_API_KEY || !NEXT_API_URL || !BOT_SECRET) {
  throw new Error(
    "Missing one of DISCORD_TOKEN, DEEPGRAM_API_KEY, NEXT_API_URL, BOT_SECRET",
  );
}

const apiBase = NEXT_API_URL.replace(/\/$/, "");
const botServerPortRaw =
  process.env.BOT_HTTP_PORT ?? process.env.PORT ?? "3001";
const botServerPort = Number.parseInt(botServerPortRaw, 10);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const deepgram = createClient(DEEPGRAM_API_KEY);
const sessionMap = new Map<string, number>();
const activeUserStreams = new Set<string>();

async function postBotJson(path: string, payload: unknown) {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bot-secret": BOT_SECRET,
    } as Record<string, string>,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(
      `Bot presence request failed (${res.status}): ${details || "No details"}`,
    );
  }
}

async function upsertGuildPresence(guild: {
  id: string;
  name: string;
  icon: string | null;
}) {
  await postBotJson("/bot/guilds", {
    guildId: guild.id,
    name: guild.name,
    icon: guild.icon ?? null,
    installed: true,
  });
}

async function markGuildRemoved(guildId: string) {
  await postBotJson("/bot/guilds", {
    guildId,
    installed: false,
  });
}

async function syncGuildPresence() {
  const guilds = [...client.guilds.cache.values()].map((guild) => ({
    guildId: guild.id,
    name: guild.name,
    icon: guild.icon ?? null,
  }));

  await postBotJson("/bot/guilds/sync", { guilds });
}

async function isBotInstalled(guildId: string) {
  try {
    await client.guilds.fetch(guildId);
    return true;
  } catch {
    return false;
  }
}

client.once(Events.ClientReady, async () => {
  console.log("🐲 DND Scribe bot online (Deepgram Nova-3)");
  try {
    await syncGuildPresence();
  } catch (error) {
    console.error("Guild presence sync failed", error);
  }
});

if (Number.isNaN(botServerPort)) {
  throw new Error("Invalid BOT_HTTP_PORT/PORT value");
}

Bun.serve({
  port: botServerPort,
  async fetch(req) {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/guilds\/([^/]+)\/installed$/);

    if (req.method !== "GET" || !match) {
      return new Response("Not Found", { status: 404 });
    }

    if (req.headers.get("x-bot-secret") !== BOT_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!client.isReady()) {
      return new Response("Bot not ready", { status: 503 });
    }

    const guildId = match[1];

    if (!guildId) {
      return new Response("Bad Request", { status: 400 });
    }

    const installed = await isBotInstalled(guildId);

    return new Response(JSON.stringify({ installed }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    await upsertGuildPresence({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ?? null,
    });
  } catch (error) {
    console.error("Guild presence upsert failed", error);
  }
});

client.on(Events.GuildDelete, async (guild) => {
  try {
    await markGuildRemoved(guild.id);
  } catch (error) {
    console.error("Guild presence removal failed", error);
  }
});

client.on(Events.GuildUpdate, async (_oldGuild, newGuild) => {
  try {
    await upsertGuildPresence({
      id: newGuild.id,
      name: newGuild.name,
      icon: newGuild.icon ?? null,
    });
  } catch (error) {
    console.error("Guild presence update failed", error);
  }
});

client.on(Events.MessageCreate, async (msg) => {
  console.log(`Message from ${msg.author.username}: ${msg.content}`);
  if (!msg.guild || msg.author.bot) return;

  if (msg.content === "!scribe start" && msg.member?.voice.channel) {
    const existingConnection = getVoiceConnection(msg.guild.id);
    if (existingConnection) {
      await msg.reply("🟡 Already listening here. Use `!scribe stop` first.");
      return;
    }

    const channel = msg.member.voice.channel;

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: msg.guild.id,
      adapterCreator: msg.guild.voiceAdapterCreator,
      selfDeaf: false,
      // Disable DAVE to avoid requiring the optional @snazzah/davey package.
      daveEncryption: false,
    });

    try {
      const res = await fetch(`${apiBase}/session/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bot-secret": BOT_SECRET,
        },
        body: JSON.stringify({ guildId: msg.guild.id, channelId: channel.id }),
      });

      if (!res?.ok) throw new Error(`API error: ${res?.status}`);

      const data = (await res.json()) as { sessionId: number };
      sessionMap.set(msg.guild.id, data.sessionId);

      await msg.reply(
        `📜 **Session #${data.sessionId} Started.** I am listening...`,
      );

      connection.receiver.speaking.on("start", (userId) => {
        if (!msg.guild) {
          throw new Error("Guild not found while starting speaker processing");
        }
        const sessionId = sessionMap.get(msg.guild?.id);
        if (!sessionId) return;

        const streamKey = `${msg.guild.id}:${userId}`;
        if (activeUserStreams.has(streamKey)) return;

        activeUserStreams.add(streamKey);
        processStream(connection, userId, sessionId, streamKey);
      });
    } catch (error) {
      console.error(error);
      await msg.reply("❌ Could not start session. Check the API.");
    }
  }

  if (msg.content === "!scribe stop") {
    const connection = getVoiceConnection(msg.guild.id);
    const sessionId = sessionMap.get(msg.guild.id);

    if (connection) {
      connection.destroy();
      for (const key of activeUserStreams) {
        if (key.startsWith(`${msg.guild.id}:`)) {
          activeUserStreams.delete(key);
        }
      }

      if (sessionId) {
        await msg.reply("🛑 Session ended. Summarizing...");

        fetch(`${apiBase}/summarize`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-bot-secret": BOT_SECRET,
          },
          body: JSON.stringify({ sessionId }),
        }).catch((err) => console.error("Summarize failed", err));

        sessionMap.delete(msg.guild.id);
      }
    }
  }
});

function processStream(
  connection: ReturnType<typeof joinVoiceChannel>,
  userId: string,
  sessionId: number,
  streamKey: string,
) {
  const opusStream = connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
  });

  const dgLive = deepgram.listen.live({
    model: "nova-3",
    smart_format: true,
    encoding: "opus",
    sample_rate: 48000,
    channels: 2,
    language: "en-US",
  });

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    activeUserStreams.delete(streamKey);
    try {
      opusStream.destroy();
    } catch {}
    try {
      dgLive.requestClose();
    } catch {}
  };

  // biome-ignore lint/suspicious/noExplicitAny: not typed
  const onData = (chunk: any) => {
    try {
      dgLive.send(chunk);
    } catch (err) {
      console.error("Deepgram send failed", err);
      cleanup();
    }
  };

  dgLive.on(LiveTranscriptionEvents.Open, () => {
    opusStream.on("data", onData);
    opusStream.once("end", cleanup);
    opusStream.once("error", (err) => {
      console.error("Opus stream error", err);
      cleanup();
    });
  });

  dgLive.on(LiveTranscriptionEvents.Transcript, async (data) => {
    if (!data.is_final) return;
    const text = data.channel.alternatives?.[0]?.transcript ?? "";
    if (!text.trim()) return;

    const user = client.users.cache.get(userId);

    fetch(`${apiBase}/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-secret": BOT_SECRET,
      } as Record<string, string>,
      body: JSON.stringify({
        sessionId,
        speaker: user?.username ?? "Unknown",
        text,
        timestamp: new Date().toISOString(),
      }),
    }).catch((err) => console.error("Ingest failed", err));
  });

  dgLive.on(LiveTranscriptionEvents.Error, (error) => {
    console.error("Deepgram error", error);
    cleanup();
  });

  // If supported by your SDK version:
  dgLive.on(LiveTranscriptionEvents.Close, cleanup);
}

client.login(DISCORD_TOKEN);
