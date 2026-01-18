import { DeepgramSttProvider } from "./deepgram";
import type { SttProvider } from "./types";

export type {
  SttProvider,
  SttStream,
  SttStreamHandlers,
  SttStreamParams,
  SttTranscript,
} from "./types";
export type SttProviderName = "deepgram";

export function createSttProviderFromEnv(
  env: Record<string, string | undefined>,
): SttProvider {
  const provider = (env.STT_PROVIDER ?? "deepgram") as SttProviderName;

  if (provider === "deepgram") {
    const key = env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("Missing DEEPGRAM_API_KEY");
    return new DeepgramSttProvider(key);
  }

  throw new Error(`Unsupported STT provider: ${provider}`);
}
