import { AssemblyAISttProvider } from "./providers/assemblyai";
import { DeepgramSttProvider } from "./providers/deepgram";
import type { SttProvider } from "./types";

export type {
  SttProvider,
  SttStream,
  SttStreamHandlers,
  SttStreamParams,
  SttTranscript,
} from "./types";
export type SttProviderName = "deepgram" | "assemblyai";

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

  throw new Error(`Unsupported STT provider: ${provider}`);
}
