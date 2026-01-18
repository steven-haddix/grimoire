import type { Readable } from "node:stream";

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

export interface TtsProvider {
  readonly name: TtsProviderName;
  synthesize(
    params: TtsRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<{ stream: Readable; contentType: string }>;
}
