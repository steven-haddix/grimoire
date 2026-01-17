import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  type VoiceConnection,
} from "@discordjs/voice";

export type TtsProviderName = "cartesia" | "elevenlabs" | "deepgram";

export type TtsVoiceConfig = {
  voice: string;
  options?: Record<string, unknown>;
};

export type TtsRequest = {
  text: string;
  voice: TtsVoiceConfig;
  language?: string;
  rate?: number;
};

export type TtsPcmFormat = {
  sampleRate: 48000;
  channels: 2;
  encoding: "s16le";
};

export const DISCORD_PCM_FORMAT: TtsPcmFormat = {
  sampleRate: 48000,
  channels: 2,
  encoding: "s16le",
};

export interface TtsProvider {
  readonly name: TtsProviderName;
  synthesize(
    params: TtsRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<{ stream: Readable; contentType: string }>;
}

export function normalizeToDiscordPcm(input: {
  stream: Readable;
  contentType: string;
  signal?: AbortSignal;
}): Readable {
  const ff = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-f",
    "s16le",
    "-ar",
    String(DISCORD_PCM_FORMAT.sampleRate),
    "-ac",
    String(DISCORD_PCM_FORMAT.channels),
    "pipe:1",
  ]);

  const out = ff.stdout as unknown as Readable;

  const abort = () => {
    try {
      input.stream.destroy();
    } catch {}
    try {
      ff.kill("SIGKILL");
    } catch {}
    try {
      out.destroy(new Error("TTS aborted"));
    } catch {}
  };

  if (input.signal) {
    if (input.signal.aborted) abort();
    input.signal.addEventListener("abort", abort, { once: true });
  }

  input.stream.pipe(ff.stdin);

  ff.on("error", (err) => out.emit("error", err));
  ff.stderr.on("data", (data) => {
    out.emit("error", new Error(`ffmpeg: ${data.toString()}`));
  });
  ff.on("close", (code) => {
    if (code !== 0) out.emit("error", new Error(`ffmpeg exited ${code}`));
  });

  return out;
}

export class ElevenLabsTtsProvider implements TtsProvider {
  readonly name: TtsProviderName = "elevenlabs";
  constructor(private apiKey: string) {}

  async synthesize(
    req: TtsRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<{ stream: Readable; contentType: string }> {
    const voiceId = req.voice.voice;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: req.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: req.voice.options ?? undefined,
        }),
        signal: opts?.signal,
      },
    );

    if (!res.ok) {
      throw new Error(
        `ElevenLabs TTS failed: ${res.status} ${await res.text()}`,
      );
    }

    const contentType = res.headers.get("content-type") ?? "audio/mpeg";
    const arrayBuf = await res.arrayBuffer();
    return { stream: Readable.from(Buffer.from(arrayBuf)), contentType };
  }
}

export class DeepgramTtsProvider implements TtsProvider {
  readonly name: TtsProviderName = "deepgram";
  constructor(private apiKey: string) {}

  async synthesize(
    req: TtsRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<{ stream: Readable; contentType: string }> {
    const voice = req.voice.voice;

    const url = new URL("https://api.deepgram.com/v1/speak");
    url.searchParams.set("model", voice);
    url.searchParams.set("encoding", "mp3");

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text: req.text }),
      signal: opts?.signal,
    });

    if (!res.ok) {
      throw new Error(`Deepgram TTS failed: ${res.status} ${await res.text()}`);
    }

    const contentType = res.headers.get("content-type") ?? "audio/mpeg";
    const arrayBuf = await res.arrayBuffer();
    return { stream: Readable.from(Buffer.from(arrayBuf)), contentType };
  }
}

export class CartesiaTtsProvider implements TtsProvider {
  readonly name: TtsProviderName = "cartesia";

  constructor(
    private apiKey: string,
    private baseUrl = "https://api.cartesia.ai",
    private version = process.env.CARTESIA_VERSION ?? "2025-04-16",
    private modelId = process.env.CARTESIA_MODEL_ID ?? "sonic-3",
  ) {}

  async synthesize(
    req: TtsRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<{ stream: Readable; contentType: string }> {
    const url = new URL("/tts/bytes", this.baseUrl);

    const body = {
      model_id: this.modelId,
      transcript: req.text,
      voice: { mode: "id", id: req.voice.voice },
      language: (req.language ?? "en") as string,
      output_format: {
        container: "wav",
        encoding: "pcm_s16le",
        sample_rate: 48000,
      },
      // optional knobs (safe defaults)
      generation_config: {
        volume: 1,
        speed: 1,
        emotion: "neutral",
      },
    };

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        // Docs show X-API-Key in the get-started guide and Authorization in API ref; this works broadly:
        "X-API-Key": this.apiKey,
        Authorization: `Bearer ${this.apiKey}`,
        "Cartesia-Version": this.version,
        "Content-Type": "application/json",
        Accept: "audio/wav",
      },
      body: JSON.stringify(body),
      signal: opts?.signal,
    });

    if (!res.ok) {
      throw new Error(`Cartesia TTS failed: ${res.status} ${await res.text()}`);
    }

    const contentType = res.headers.get("content-type") ?? "audio/wav";
    const arrayBuf = await res.arrayBuffer();
    return { stream: Readable.from(Buffer.from(arrayBuf)), contentType };
  }
}

export class TtsService {
  constructor(private provider: TtsProvider) {}

  setProvider(provider: TtsProvider) {
    this.provider = provider;
  }

  getProviderName() {
    return this.provider.name;
  }

  async synthesizeToPcmStream(
    req: TtsRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<Readable> {
    const { stream, contentType } = await this.provider.synthesize(req, opts);
    return normalizeToDiscordPcm({ stream, contentType, signal: opts?.signal });
  }
}

export function createTtsProviderFromEnv(
  env: Record<string, string | undefined>,
): TtsProvider {
  const provider = (env.TTS_PROVIDER ?? "deepgram") as TtsProviderName;

  if (provider === "elevenlabs") {
    const key = env.ELEVENLABS_API_KEY;
    if (!key) throw new Error("Missing ELEVENLABS_API_KEY");
    return new ElevenLabsTtsProvider(key);
  }

  if (provider === "cartesia") {
    const key = env.CARTESIA_API_KEY;
    if (!key) throw new Error("Missing CARTESIA_API_KEY");
    return new CartesiaTtsProvider(
      key,
      env.CARTESIA_BASE_URL ?? "https://api.cartesia.ai",
    );
  }

  const key = env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("Missing DEEPGRAM_API_KEY");
  return new DeepgramTtsProvider(key);
}

type SpeakJob = {
  text: string;
  voice: TtsVoiceConfig;
  resolve: () => void;
  reject: (err: unknown) => void;
};

export class GuildSpeechQueue {
  private queue: SpeakJob[] = [];
  private processing = false;
  private player = createAudioPlayer();
  private currentAbort: AbortController | null = null;

  constructor(
    private connection: VoiceConnection,
    private tts: TtsService,
    private opts: { maxQueue?: number } = {},
  ) {
    this.connection.subscribe(this.player);
  }

  speak(text: string, voice: TtsVoiceConfig): Promise<void> {
    const max = this.opts.maxQueue ?? 50;
    if (this.queue.length >= max) {
      return Promise.reject(new Error("TTS queue full"));
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ text, voice, resolve, reject });
      void this.processQueue();
    });
  }

  stopAll(reason = "stopped") {
    while (this.queue.length) {
      const job = this.queue.shift();
      if (job) job.reject(new Error(reason));
    }

    try {
      this.currentAbort?.abort();
    } catch {}
    this.currentAbort = null;

    try {
      this.player.stop(true);
    } catch {}
  }

  interrupt() {
    try {
      this.currentAbort?.abort();
    } catch {}
    this.currentAbort = null;

    try {
      this.player.stop(true);
    } catch {}
  }

  setConnection(connection: VoiceConnection) {
    this.connection = connection;
    this.connection.subscribe(this.player);
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        if (!job) continue;

        const ac = new AbortController();
        this.currentAbort = ac;

        try {
          const pcm = await this.tts.synthesizeToPcmStream(
            { text: job.text, voice: job.voice },
            { signal: ac.signal },
          );
          const resource = createAudioResource(pcm, {
            inputType: StreamType.Raw,
          });

          await new Promise<void>((resolve, reject) => {
            const onIdle = () => {
              cleanup();
              resolve();
            };
            const onError = (err: unknown) => {
              cleanup();
              reject(err);
            };

            const cleanup = () => {
              this.player.off(AudioPlayerStatus.Idle, onIdle);
              this.player.off("error", onError as () => void);
            };

            this.player.on(AudioPlayerStatus.Idle, onIdle);
            this.player.on("error", onError as () => void);
            this.player.play(resource);
          });

          job.resolve();
        } catch (err) {
          job.reject(err);
        } finally {
          this.currentAbort = null;
        }
      }
    } finally {
      this.processing = false;
    }
  }
}

const speechQueues = new Map<string, GuildSpeechQueue>();

export function getGuildSpeechQueue(params: {
  guildId: string;
  connection: VoiceConnection;
  tts: TtsService;
}) {
  const existing = speechQueues.get(params.guildId);
  if (existing) {
    existing.setConnection(params.connection);
    return existing;
  }

  const queue = new GuildSpeechQueue(params.connection, params.tts, {
    maxQueue: 50,
  });
  speechQueues.set(params.guildId, queue);
  return queue;
}

export function removeGuildSpeechQueue(guildId: string) {
  const queue = speechQueues.get(guildId);
  if (queue) queue.stopAll("queue removed");
  speechQueues.delete(guildId);
}
