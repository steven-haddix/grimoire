import { describe, expect, test } from "bun:test";
import type { RealtimeEvent } from "@mistralai/mistralai/extra/realtime";
import { MistralRealtimeSttProvider } from "./mistral-realtime";

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

class FakeRealtimeConnection implements AsyncIterable<RealtimeEvent> {
  readonly sentAudio: Uint8Array[] = [];
  readonly closeCalls: Array<{ code?: number; reason?: string }> = [];
  endAudioCalls = 0;
  isClosed = false;

  private queue: Array<RealtimeEvent | null> = [];
  private resolver: ((event: RealtimeEvent | null) => void) | null = null;

  pushEvent(event: RealtimeEvent) {
    if (this.resolver) {
      const resolve = this.resolver;
      this.resolver = null;
      resolve(event);
      return;
    }
    this.queue.push(event);
  }

  async sendAudio(audioBytes: Uint8Array | ArrayBuffer): Promise<void> {
    const chunk =
      audioBytes instanceof Uint8Array
        ? audioBytes
        : new Uint8Array(audioBytes);
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    this.sentAudio.push(copy);
  }

  async endAudio(): Promise<void> {
    this.endAudioCalls += 1;
  }

  async close(code?: number, reason?: string): Promise<void> {
    this.closeCalls.push({ code, reason });
    this.isClosed = true;
    if (this.resolver) {
      const resolve = this.resolver;
      this.resolver = null;
      resolve(null);
      return;
    }
    this.queue.push(null);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<RealtimeEvent> {
    while (true) {
      const buffered = this.queue.shift();
      const next =
        buffered ??
        (await new Promise<RealtimeEvent | null>((resolve) => {
          this.resolver = resolve;
        }));
      if (next === null) break;
      yield next;
    }
  }
}

type ConnectCall = {
  model: string;
  options?: {
    audioFormat?: { encoding: string; sampleRate: number };
    serverUrl?: string;
    timeoutMs?: number;
  };
};

class FakeRealtimeClient {
  readonly connection = new FakeRealtimeConnection();
  readonly calls: ConnectCall[] = [];
  error: Error | null = null;

  private connectGate: Promise<void> | null = null;
  private releaseConnect: (() => void) | null = null;

  blockConnect() {
    this.connectGate = new Promise<void>((resolve) => {
      this.releaseConnect = resolve;
    });
  }

  unblockConnect() {
    this.releaseConnect?.();
    this.releaseConnect = null;
    this.connectGate = null;
  }

  async connect(
    model: string,
    options?: ConnectCall["options"],
  ): Promise<FakeRealtimeConnection> {
    this.calls.push({ model, options });
    if (this.error) throw this.error;
    if (this.connectGate) {
      await this.connectGate;
    }
    return this.connection;
  }
}

function delta(text: string): RealtimeEvent {
  return {
    type: "transcription.text.delta",
    text,
  } as unknown as RealtimeEvent;
}

function segment(text: string): RealtimeEvent {
  return {
    type: "transcription.segment",
    text,
    start: 0,
    end: 1,
  } as unknown as RealtimeEvent;
}

describe("MistralRealtimeSttProvider", () => {
  test("uses segments as commit source and avoids delta duplication", async () => {
    const client = new FakeRealtimeClient();
    const provider = new MistralRealtimeSttProvider(
      "test-key",
      { silenceTimeoutMs: 20 },
      { realtimeClient: client },
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

    await Bun.sleep(0);

    client.connection.pushEvent(delta("we enter "));
    client.connection.pushEvent(delta("barovia"));
    client.connection.pushEvent(segment("we enter barovia"));
    client.connection.pushEvent(segment("initiative rolled"));

    await Bun.sleep(30);

    expect(transcripts).toEqual([
      { text: "we enter barovia initiative rolled", isFinal: true },
    ]);

    await stream.close();
  });

  test("falls back to delta-only text when segments are absent", async () => {
    const client = new FakeRealtimeClient();
    const provider = new MistralRealtimeSttProvider(
      "test-key",
      { silenceTimeoutMs: 20 },
      { realtimeClient: client },
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

    client.connection.pushEvent(delta("storm "));
    client.connection.pushEvent(delta("approaches"));

    await Bun.sleep(30);

    expect(transcripts).toEqual([{ text: "storm approaches", isFinal: true }]);

    await stream.close();
  });

  test("does not emit punctuation-only segments", async () => {
    const client = new FakeRealtimeClient();
    const provider = new MistralRealtimeSttProvider(
      "test-key",
      { silenceTimeoutMs: 20 },
      { realtimeClient: client },
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

    client.connection.pushEvent(segment("."));

    await Bun.sleep(30);

    expect(transcripts).toHaveLength(0);

    await stream.close();
  });

  test("does not emit punctuation-only delta fallback", async () => {
    const client = new FakeRealtimeClient();
    const provider = new MistralRealtimeSttProvider(
      "test-key",
      { silenceTimeoutMs: 20 },
      { realtimeClient: client },
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

    client.connection.pushEvent(delta("."));

    await Bun.sleep(30);

    expect(transcripts).toHaveLength(0);

    await stream.close();
  });

  test("carries punctuation-only segment into the next meaningful transcript", async () => {
    const client = new FakeRealtimeClient();
    const provider = new MistralRealtimeSttProvider(
      "test-key",
      { silenceTimeoutMs: 20 },
      { realtimeClient: client },
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

    client.connection.pushEvent(segment("."));
    await Bun.sleep(30);
    expect(transcripts).toHaveLength(0);

    client.connection.pushEvent(segment("i just might end up killing"));
    await Bun.sleep(30);

    expect(transcripts).toEqual([
      { text: ". i just might end up killing", isFinal: true },
    ]);

    await stream.close();
  });

  test("fails fast on queue overflow instead of dropping audio", async () => {
    const client = new FakeRealtimeClient();
    client.blockConnect();

    const provider = new MistralRealtimeSttProvider(
      "test-key",
      {
        maxQueueBytes: 250,
        silenceTimeoutMs: 10_000,
      },
      { realtimeClient: client },
    );

    const errors: unknown[] = [];

    const stream = provider.createStream(
      { encoding: "linear16" },
      {
        onError: (error) => {
          errors.push(error);
        },
      },
    );

    stream.send(Uint8Array.from({ length: 100 }, () => 1));
    stream.send(Uint8Array.from({ length: 100 }, () => 2));
    stream.send(Uint8Array.from({ length: 100 }, () => 3));

    client.unblockConnect();
    await Bun.sleep(30);

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toContain("queue overflowed");

    // Overflow path closes stream instead of silently dropping and continuing.
    expect(client.connection.sentAudio).toHaveLength(0);

    await stream.close();
  });

  test("decodes opus input and sends 16k mono PCM chunks", async () => {
    const client = new FakeRealtimeClient();
    const decoder = new FakeDecoder();

    const provider = new MistralRealtimeSttProvider("test-key", undefined, {
      realtimeClient: client,
      createDecoder: () => decoder,
    });

    const stream = provider.createStream({ encoding: "opus" }, {});

    stream.send(new Uint8Array([1, 2, 3]));
    expect(decoder.writes).toHaveLength(1);

    // 12 bytes at 48kHz stereo downsample to 2 bytes at 16kHz mono.
    decoder.emit("data", Buffer.alloc(1_200));

    await Bun.sleep(10);

    expect(client.connection.sentAudio).toHaveLength(1);
    expect(client.connection.sentAudio[0]?.byteLength).toBe(200);

    await stream.close();
    expect(decoder.destroyCalls).toBe(1);
  });
});
