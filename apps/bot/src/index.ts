import "dotenv/config";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import {
	EndBehaviorType,
	getVoiceConnection,
	joinVoiceChannel,
} from "@discordjs/voice";
import { Client, Events, GatewayIntentBits } from "discord.js";
import prism from "prism-media";

const { DISCORD_TOKEN, DEEPGRAM_API_KEY, NEXT_API_URL, BOT_SECRET } =
	process.env;

if (!DISCORD_TOKEN || !DEEPGRAM_API_KEY || !NEXT_API_URL || !BOT_SECRET) {
	throw new Error(
		"Missing one of DISCORD_TOKEN, DEEPGRAM_API_KEY, NEXT_API_URL, BOT_SECRET",
	);
}

const apiBase = NEXT_API_URL.replace(/\/$/, "");

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

client.once(Events.ClientReady, () => {
	console.log("🐲 DND Scribe bot online (Deepgram Nova-3)");
});

client.on(Events.MessageCreate, async (msg) => {
	if (!msg.guild || msg.author.bot) return;

	if (msg.content === "!scribe start" && msg.member?.voice.channel) {
		const channel = msg.member.voice.channel;

		const connection = joinVoiceChannel({
			channelId: channel.id,
			guildId: msg.guild.id,
			adapterCreator: msg.guild.voiceAdapterCreator,
			selfDeaf: false,
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

			if (!res.ok) throw new Error(`API error: ${res.status}`);

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
				if (sessionId) processStream(connection, userId, sessionId);
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
) {
	const opusStream = connection.receiver.subscribe(userId, {
		end: {
			behavior: EndBehaviorType.AfterSilence,
			duration: 1000,
		},
	});

	const decoder = new prism.opus.Decoder({
		rate: 48000,
		channels: 2,
		frameSize: 960,
	});
	const pcmStream = opusStream.pipe(decoder);

	const dgLive = deepgram.listen.live({
		model: "nova-3",
		smart_format: true,
		encoding: "linear16",
		sample_rate: 48000,
		channels: 2,
		language: "en-US",
	});

	dgLive.on(LiveTranscriptionEvents.Open, () => {
		pcmStream.on("data", (chunk) => dgLive.send(chunk));
		pcmStream.on("end", () => dgLive.finish());
	});

	dgLive.on(LiveTranscriptionEvents.Transcript, async (data) => {
		if (!data.is_final) return;

		const text = data.channel.alternatives?.[0]?.transcript ?? "";
		if (!text.trim()) return;

		const user = client.users.cache.get(userId);

		await fetch(`${apiBase}/ingest`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-bot-secret": BOT_SECRET,
			},
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
	});
}

client.login(DISCORD_TOKEN);
