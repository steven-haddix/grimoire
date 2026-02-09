import { describe, expect, test } from "bun:test";
import { MistralSttProvider } from "./mistral";
import type { TranscriptionClientLike } from "./mistral";

type DecoderEventName = "data" | "error";
type EventListener = (...args: unknown[]) => void;

class FakeDecoder {
  writes: Uint8Array[] = [];
  destroyCalls = 0;
  private listeners = new Map<DecoderEventName, EventListener[]>();

  on(event: "data", listener: (pcm: Buffer) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(
    event: DecoderEventName,
    listener: ((pcm: Buffer) => void) | ((error: Error) => void),
  ) {
    const current = this.listeners.get(event) ?? [];
    current.push(listener as EventListener);
    this.listeners.set(event, current);
  }

  emit(event: DecoderEventName, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }

  write(chunk: Uint8Array) {
    this.writes.push(chunk);
  }

  destroy() {
    this.destroyCalls += 1;
  }
}

type CompletionCall = {
  model: string;
  file: { fileName: string; content: Uint8Array };
  language?: string | null;
  contextBias?: string[];
};

class FakeTranscriptionClient implements TranscriptionClientLike {
  calls: CompletionCall[] = [];
  response: { text: string } = { text: "" };
  error: Error | null = null;
  /** If set, complete() will block until resolved */
  private blockPromise: Promise<void> | null = null;

  blockNextCall(): { unblock: () => void } {
    let resolve: () => void;
    this.blockPromise = new Promise<void>((r) => {
      resolve = r;
    });
    return {
      unblock: () => {
        resolve();
        this.blockPromise = null;
      },
    };
  }

  async complete(request: CompletionCall): Promise<{ text: string }> {
    this.calls.push(request);
    if (this.blockPromise) {
      await this.blockPromise;
    }
    if (this.error) throw this.error;
    return this.response;
  }
}

function makeLargePcmBuffer(bytes: number): Buffer {
  return Buffer.alloc(bytes);
}

describe("MistralSttProvider (batch)", () => {
  test("batch flush lifecycle: decode opus, downsample, flush to API, emit transcript", async () => {
    const client = new FakeTranscriptionClient();
    client.response = { text: "hello adventurers" };
    const decoder = new FakeDecoder();

    const provider = new MistralSttProvider(
      "test-key",
      { flushIntervalMs: 10 },
      { transcriptionClient: client, createDecoder: () => decoder },
    );

    const transcripts: Array<{ text: string; isFinal: boolean }> = [];
    let openCalls = 0;
    let closeCalls = 0;

    const stream = provider.createStream(
      { encoding: "opus" },
      {
        onOpen: () => {
          openCalls += 1;
        },
        onClose: () => {
          closeCalls += 1;
        },
        onTranscript: (t) => {
          transcripts.push(t);
        },
      },
    );

    expect(openCalls).toBe(1);

    // Send opus data -> decoder
    stream.send(new Uint8Array([1, 2, 3]));
    expect(decoder.writes).toHaveLength(1);

    // Decoder emits PCM (needs to produce enough for MIN_FLUSH_BYTES = 32000)
    // 12 bytes of 48kHz stereo -> 2 bytes of 16kHz mono after downsample
    // We need at least 32000 bytes, so emit a large chunk directly
    // 48kHz stereo at 12 bytes per sample -> to get 32000 output bytes we need 16000 samples * 12 = 192000 input bytes
    decoder.emit("data", Buffer.alloc(192_000));

    // Wait for flush interval to fire
    await Bun.sleep(30);

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.model).toBe("voxtral-mini-latest");
    expect(client.calls[0]!.file.fileName).toBe("chunk.wav");

    // Verify WAV header
    const wavContent = client.calls[0]!.file.content;
    const header = Buffer.from(wavContent.buffer, wavContent.byteOffset, 44);
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    expect(header.toString("ascii", 8, 12)).toBe("WAVE");
    expect(header.readUInt32LE(24)).toBe(16000); // sample rate
    expect(header.readUInt16LE(22)).toBe(1); // mono

    expect(transcripts).toEqual([{ text: "hello adventurers", isFinal: true }]);

    stream.close();
    await Bun.sleep(10);
    expect(closeCalls).toBe(1);
    expect(decoder.destroyCalls).toBe(1);
  });

  test("skips flush when buffer is below MIN_FLUSH_BYTES", async () => {
    const client = new FakeTranscriptionClient();
    client.response = { text: "tiny" };

    const provider = new MistralSttProvider(
      "test-key",
      { flushIntervalMs: 10 },
      { transcriptionClient: client },
    );

    const transcripts: Array<{ text: string; isFinal: boolean }> = [];

    const stream = provider.createStream(
      { encoding: "linear16" },
      {
        onTranscript: (t) => {
          transcripts.push(t);
        },
      },
    );

    // Send a tiny chunk (< 32000 bytes)
    stream.send(new Uint8Array(100));
    await Bun.sleep(30);

    // Timer flush should have been skipped
    expect(client.calls).toHaveLength(0);
    expect(transcripts).toHaveLength(0);

    stream.close();
    await Bun.sleep(10);
  });

  test("final flush on close sends remaining audio regardless of MIN_FLUSH_BYTES", async () => {
    const client = new FakeTranscriptionClient();
    client.response = { text: "final words" };

    const provider = new MistralSttProvider(
      "test-key",
      { flushIntervalMs: 60_000 }, // Long interval so timer won't fire
      { transcriptionClient: client },
    );

    const transcripts: Array<{ text: string; isFinal: boolean }> = [];
    let closeCalls = 0;

    const stream = provider.createStream(
      { encoding: "linear16" },
      {
        onClose: () => {
          closeCalls += 1;
        },
        onTranscript: (t) => {
          transcripts.push(t);
        },
      },
    );

    // Send small amount of audio
    stream.send(new Uint8Array(500));

    // Close should trigger final flush even below MIN_FLUSH_BYTES
    await stream.close();

    expect(client.calls).toHaveLength(1);
    expect(transcripts).toEqual([{ text: "final words", isFinal: true }]);
    expect(closeCalls).toBe(1);
  });

  test("non-opus passthrough: linear16 chunks reach API directly", async () => {
    const client = new FakeTranscriptionClient();
    client.response = { text: "direct audio" };

    const provider = new MistralSttProvider(
      "test-key",
      { flushIntervalMs: 10 },
      { transcriptionClient: client },
    );

    const transcripts: Array<{ text: string; isFinal: boolean }> = [];

    const stream = provider.createStream(
      { encoding: "linear16" },
      {
        onTranscript: (t) => {
          transcripts.push(t);
        },
      },
    );

    // Send enough PCM to exceed MIN_FLUSH_BYTES
    stream.send(makeLargePcmBuffer(40_000));
    await Bun.sleep(30);

    expect(client.calls).toHaveLength(1);
    // WAV header (44) + 40000 bytes PCM
    expect(client.calls[0]!.file.content.byteLength).toBe(44 + 40_000);
    expect(transcripts).toEqual([{ text: "direct audio", isFinal: true }]);

    stream.close();
    await Bun.sleep(10);
  });

  test("API error does not close stream — next flush still works", async () => {
    const client = new FakeTranscriptionClient();
    client.error = new Error("API failure");

    const provider = new MistralSttProvider(
      "test-key",
      { flushIntervalMs: 10 },
      { transcriptionClient: client },
    );

    const errors: unknown[] = [];
    const transcripts: Array<{ text: string; isFinal: boolean }> = [];
    let closeCalls = 0;

    const stream = provider.createStream(
      { encoding: "linear16" },
      {
        onClose: () => {
          closeCalls += 1;
        },
        onError: (e) => {
          errors.push(e);
        },
        onTranscript: (t) => {
          transcripts.push(t);
        },
      },
    );

    // First flush: will fail
    stream.send(makeLargePcmBuffer(40_000));
    await Bun.sleep(30);

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("API failure");
    expect(closeCalls).toBe(0); // Stream is still open

    // Fix the client and send more audio
    client.error = null;
    client.response = { text: "recovered" };
    stream.send(makeLargePcmBuffer(40_000));
    await Bun.sleep(30);

    expect(client.calls).toHaveLength(2);
    expect(transcripts).toEqual([{ text: "recovered", isFinal: true }]);

    stream.close();
    await Bun.sleep(10);
    expect(closeCalls).toBe(1);
  });

  test("contextBias and language are forwarded to the API", async () => {
    const client = new FakeTranscriptionClient();
    client.response = { text: "Strahd attacks" };

    const provider = new MistralSttProvider(
      "test-key",
      {
        flushIntervalMs: 10,
        contextBias: ["Strahd", "Phandalin", "Eldritch Blast"],
      },
      { transcriptionClient: client },
    );

    const stream = provider.createStream(
      { encoding: "linear16", language: "en" },
      { onTranscript: () => {} },
    );

    stream.send(makeLargePcmBuffer(40_000));
    await Bun.sleep(30);

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.language).toBe("en");
    expect(client.calls[0]!.contextBias).toEqual([
      "Strahd",
      "Phandalin",
      "Eldritch Blast",
    ]);

    stream.close();
    await Bun.sleep(10);
  });

  test("normalizes BCP 47 locale tags to alpha-2 (en-US → en)", async () => {
    const client = new FakeTranscriptionClient();
    client.response = { text: "hello" };

    const provider = new MistralSttProvider(
      "test-key",
      { flushIntervalMs: 10 },
      { transcriptionClient: client },
    );

    const stream = provider.createStream(
      { encoding: "linear16", language: "en-US" },
      { onTranscript: () => {} },
    );

    stream.send(makeLargePcmBuffer(40_000));
    await Bun.sleep(30);

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.language).toBe("en");

    stream.close();
    await Bun.sleep(10);
  });

  test("concurrent flush guard: overlapping flush is skipped", async () => {
    const client = new FakeTranscriptionClient();
    client.response = { text: "result" };
    const { unblock } = client.blockNextCall();

    const provider = new MistralSttProvider(
      "test-key",
      { flushIntervalMs: 10 },
      { transcriptionClient: client },
    );

    const transcripts: Array<{ text: string; isFinal: boolean }> = [];

    const stream = provider.createStream(
      { encoding: "linear16" },
      {
        onTranscript: (t) => {
          transcripts.push(t);
        },
      },
    );

    // Send audio to trigger first flush
    stream.send(makeLargePcmBuffer(40_000));
    await Bun.sleep(15);

    // First flush is now in progress (blocked). Send more audio.
    stream.send(makeLargePcmBuffer(40_000));
    await Bun.sleep(15);

    // The second timer tick should have been skipped because a flush is already in-flight
    // Only 1 call should be in progress
    expect(client.calls).toHaveLength(1);

    // Unblock the first flush
    unblock();
    await Bun.sleep(30);

    // Now the second batch should have flushed on a subsequent tick
    expect(client.calls).toHaveLength(2);
    expect(transcripts).toHaveLength(2);

    stream.close();
    await Bun.sleep(10);
  });

  test("close waits for in-flight flush and then flushes buffered tail audio", async () => {
    const client = new FakeTranscriptionClient();
    client.response = { text: "result" };
    const { unblock } = client.blockNextCall();

    const provider = new MistralSttProvider(
      "test-key",
      { flushIntervalMs: 10 },
      { transcriptionClient: client },
    );

    const transcripts: Array<{ text: string; isFinal: boolean }> = [];
    let closeCalls = 0;

    const stream = provider.createStream(
      { encoding: "linear16" },
      {
        onClose: () => {
          closeCalls += 1;
        },
        onTranscript: (t) => {
          transcripts.push(t);
        },
      },
    );

    // Trigger first flush, then keep second batch buffered while first call is blocked.
    stream.send(makeLargePcmBuffer(40_000));
    await Bun.sleep(15);
    stream.send(new Uint8Array(500));

    const closePromise = stream.close();

    // close() must wait for in-flight request before force-flushing buffered tail audio.
    unblock();
    await closePromise;

    expect(client.calls).toHaveLength(2);
    expect(transcripts).toHaveLength(2);
    expect(closeCalls).toBe(1);
  });

  test("empty API response does not emit transcript", async () => {
    const client = new FakeTranscriptionClient();
    client.response = { text: "  " };

    const provider = new MistralSttProvider(
      "test-key",
      { flushIntervalMs: 10 },
      { transcriptionClient: client },
    );

    const transcripts: Array<{ text: string; isFinal: boolean }> = [];

    const stream = provider.createStream(
      { encoding: "linear16" },
      {
        onTranscript: (t) => {
          transcripts.push(t);
        },
      },
    );

    stream.send(makeLargePcmBuffer(40_000));
    await Bun.sleep(30);

    expect(client.calls).toHaveLength(1);
    expect(transcripts).toHaveLength(0);

    stream.close();
    await Bun.sleep(10);
  });
});
