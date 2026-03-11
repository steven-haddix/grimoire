import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Readable } from "node:stream";
import { InworldTtsProvider } from "./inworld";

function createJsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
}

function createWavChunk(payload: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + payload.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(48_000, 24);
  header.writeUInt32LE(96_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(payload.length, 40);
  return Buffer.concat([header, payload]);
}

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

describe("InworldTtsProvider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  test("converts streamed JSON audio chunks into raw PCM", async () => {
    const pcmA = Buffer.from([1, 2, 3, 4]);
    const pcmB = Buffer.from([5, 6, 7, 8]);
    const fetchMock = mock(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.inworld.ai/tts/v1/voice:stream");

      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        text: "Speak, skeleton",
        voiceId: "Hades",
        modelId: "inworld-tts-1.5-max",
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: 48_000,
        },
      });

      return new Response(
        createJsonStream([
          JSON.stringify({
            result: {
              audioContent: createWavChunk(pcmA).toString("base64"),
            },
          }),
          JSON.stringify({
            result: {
              audioContent: createWavChunk(pcmB).toString("base64"),
            },
          }),
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    });

    globalThis.fetch = fetchMock as typeof fetch;

    const provider = new InworldTtsProvider("test-key");
    const { stream, contentType } = await provider.synthesize({
      text: "Speak, skeleton",
      voice: { voice: "Hades" },
    });

    expect(contentType).toBe("audio/raw;encoding=s16le;rate=48000;channels=1");
    expect(await readStream(stream)).toEqual(Buffer.concat([pcmA, pcmB]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("emits stream errors when Inworld sends an error chunk", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        createJsonStream([
          JSON.stringify({
            error: {
              message: "voice unavailable",
            },
          }),
        ]),
        { status: 200 },
      );
    }) as typeof fetch;

    const provider = new InworldTtsProvider("test-key");
    const { stream } = await provider.synthesize({
      text: "Hello",
      voice: { voice: "Hades" },
    });

    await expect(readStream(stream)).rejects.toThrow("Inworld Stream Error");
  });
});
