import { Readable } from "node:stream";
import type { TtsProvider, TtsProviderName, TtsRequest } from "../types";

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
