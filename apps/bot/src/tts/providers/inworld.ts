import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { responseToNodeStream } from "../streaming";
import type { TtsProvider, TtsProviderName, TtsRequest } from "../types";

export class InworldTtsProvider implements TtsProvider {
  readonly name: TtsProviderName = "inworld";

  constructor(
    private apiKey: string,
    private baseUrl = "https://api.inworld.ai",
  ) {}

  async synthesize(
    req: TtsRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<{ stream: Readable; contentType: string }> {
    const url = new URL("/tts/v1/voice:stream", this.baseUrl);

    const body = {
      text: req.text,
      voiceId: req.voice.voice,
      modelId: "inworld-tts-1.5-max",
      audio_config: {
        audio_encoding: "MP3",
        sample_rate_hertz: 48000,
      },
    };

    if (req.voice.options) {
      Object.assign(body, req.voice.options);
    }

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: opts?.signal,
    });

    if (!res.ok) {
      throw new Error(`Inworld TTS failed: ${res.status} ${await res.text()}`);
    }

    // Create a readable stream that we will push audio data into
    const audioStream = new Readable({
      read() {}, // No-op, we push data as it arrives
    });

    // Get the response stream as a Node stream
    const nodeStream = await responseToNodeStream(res);

    // Parse line-delimited JSON
    const rl = createInterface({
      input: nodeStream,
      crlfDelay: Infinity,
    });

    // Process the stream in the background
    (async () => {
      try {
        for await (const line of rl) {
          if (!line.trim()) continue;
          
          try {
            const chunk = JSON.parse(line);
            
            if (chunk.error) {
              throw new Error(`Inworld Stream Error: ${JSON.stringify(chunk.error)}`);
            }

            if (chunk.result?.audioContent) {
              const audioBuffer = Buffer.from(chunk.result.audioContent, "base64");
              audioStream.push(audioBuffer);
            }
          } catch (e) {
            // If the error was thrown by us (chunk.error), rethrow it
            if (e instanceof Error && e.message.startsWith("Inworld Stream Error")) {
              throw e;
            }
            // Otherwise log parse errors but continue if possible? 
            // Better to fail if we can't parse reliable data
            console.warn("Error processing Inworld TTS chunk:", e);
          }
        }
      } catch (err) {
        audioStream.emit("error", err);
      } finally {
        audioStream.push(null); // Signal end of stream
      }
    })();

    return { stream: audioStream, contentType: "audio/mpeg" };
  }
}
