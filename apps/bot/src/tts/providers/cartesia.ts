import { responseToNodeStream } from "../streaming";
import type { TtsProvider, TtsProviderName, TtsRequest } from "../types";

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
    const stream = await responseToNodeStream(res);
    return { stream, contentType };
  }
}
