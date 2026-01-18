import { responseToNodeStream } from "../streaming";
import type { TtsProvider, TtsProviderName, TtsRequest } from "../types";

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
    const stream = await responseToNodeStream(res);
    return { stream, contentType };
  }
}
