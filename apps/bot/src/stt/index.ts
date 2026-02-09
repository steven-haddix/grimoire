import { AssemblyAISttProvider } from "./providers/assemblyai";
import { DeepgramSttProvider } from "./providers/deepgram";
import { MistralSttProvider } from "./providers/mistral";
import { MistralRealtimeSttProvider } from "./providers/mistral-realtime";
import type { SttProvider } from "./types";

export type {
  SttProvider,
  SttStream,
  SttStreamHandlers,
  SttStreamParams,
  SttTranscript,
} from "./types";
export type SttProviderName =
  | "deepgram"
  | "assemblyai"
  | "mistral"
  | "mistral-realtime";

export function createSttProviderFromEnv(
  env: Record<string, string | undefined>,
): SttProvider {
  const provider = (env.STT_PROVIDER ?? "deepgram") as SttProviderName;

  if (provider === "deepgram") {
    const key = env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("Missing DEEPGRAM_API_KEY");
    return new DeepgramSttProvider(key);
  }

  if (provider === "assemblyai") {
    const key = env.ASSEMBLYAI_API_KEY;
    if (!key) throw new Error("Missing ASSEMBLYAI_API_KEY");
    return new AssemblyAISttProvider(key);
  }

  if (provider === "mistral") {
    const key = env.MISTRAL_API_KEY;
    if (!key) throw new Error("Missing MISTRAL_API_KEY");
    return new MistralSttProvider(key, {
      flushIntervalMs: env.MISTRAL_FLUSH_INTERVAL_MS
        ? Number(env.MISTRAL_FLUSH_INTERVAL_MS)
        : undefined,
      contextBias: env.MISTRAL_CONTEXT_BIAS
        ? env.MISTRAL_CONTEXT_BIAS.split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    });
  }

  if (provider === "mistral-realtime") {
    const key = env.MISTRAL_API_KEY;
    if (!key) throw new Error("Missing MISTRAL_API_KEY");
    return new MistralRealtimeSttProvider(key, {
      model: env.MISTRAL_REALTIME_MODEL,
      serverUrl: env.MISTRAL_BASE_URL,
      connectTimeoutMs: env.MISTRAL_REALTIME_CONNECT_TIMEOUT_MS
        ? Number(env.MISTRAL_REALTIME_CONNECT_TIMEOUT_MS)
        : undefined,
      silenceTimeoutMs: env.MISTRAL_REALTIME_SILENCE_TIMEOUT_MS
        ? Number(env.MISTRAL_REALTIME_SILENCE_TIMEOUT_MS)
        : undefined,
      maxQueueBytes: env.MISTRAL_REALTIME_MAX_QUEUE_BYTES
        ? Number(env.MISTRAL_REALTIME_MAX_QUEUE_BYTES)
        : undefined,
      maxBufferedTextChars: env.MISTRAL_REALTIME_MAX_BUFFERED_TEXT_CHARS
        ? Number(env.MISTRAL_REALTIME_MAX_BUFFERED_TEXT_CHARS)
        : undefined,
    });
  }

  throw new Error(`Unsupported STT provider: ${provider}`);
}
