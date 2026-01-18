import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { CartesiaTtsProvider } from "./providers/cartesia";
import { DeepgramTtsProvider } from "./providers/deepgram";
import { ElevenLabsTtsProvider } from "./providers/elevenlabs";
import type { TtsPcmFormat, TtsProvider, TtsProviderName } from "./types";

export type {
  TtsPcmFormat,
  TtsProvider,
  TtsProviderName,
  TtsRequest,
  TtsVoiceConfig,
} from "./types";

export const DISCORD_PCM_FORMAT: TtsPcmFormat = {
  sampleRate: 48000,
  channels: 2,
  encoding: "s16le",
};

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
