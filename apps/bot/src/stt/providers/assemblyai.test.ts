import { describe, expect, test } from "bun:test";
import type { BeginEvent, TurnEvent } from "assemblyai";
import { AssemblyAISttProvider } from "./assemblyai";

type EventName = "open" | "turn" | "error" | "close";
type DecoderEventName = "data" | "error";
type EventListener = (...args: unknown[]) => void;

class FakeTranscriber {
  connectCalls = 0;
  closeCalls = 0;
  sentAudio: ArrayBufferLike[] = [];
  private listeners = new Map<EventName, EventListener[]>();

  on(event: "open", listener: (event: BeginEvent) => void): void;
  on(event: "turn", listener: (event: TurnEvent) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number, reason: string) => void): void;
  on(
    event: EventName,
    listener:
      | ((event: BeginEvent) => void)
      | ((event: TurnEvent) => void)
      | ((error: Error) => void)
      | ((code: number, reason: string) => void),
  ) {
    const current = this.listeners.get(event) ?? [];
    current.push(listener as EventListener);
    this.listeners.set(event, current);
  }

  emit(event: EventName, ...args: unknown[]) {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }

  connect() {
    this.connectCalls += 1;
  }

  sendAudio(audio: ArrayBufferLike) {
    this.sentAudio.push(audio);
  }

  close() {
    this.closeCalls += 1;
  }
}

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

function createClient(transcriber: FakeTranscriber) {
  return {
    streaming: {
      transcriber: () => transcriber,
    },
  };
}

function createTurn(partial: Partial<TurnEvent>): TurnEvent {
  return {
    type: "Turn",
    turn_order: 1,
    turn_is_formatted: true,
    end_of_turn: false,
    transcript: "",
    end_of_turn_confidence: 0,
    words: [],
    ...partial,
  };
}

function withSilentConsole(run: () => void) {
  const originalError = console.error;
  const originalDebug = console.debug;
  console.error = () => {};
  console.debug = () => {};
  try {
    run();
  } finally {
    console.error = originalError;
    console.debug = originalDebug;
  }
}

describe("AssemblyAISttProvider", () => {
  test("connects and maps events, only emitting formatted final turns", () => {
    const transcriber = new FakeTranscriber();
    const provider = new AssemblyAISttProvider("test-key", {
      client: createClient(transcriber),
    });

    let openCalls = 0;
    let closeCalls = 0;
    const transcripts: Array<{ text: string; isFinal: boolean }> = [];
    const errors: Error[] = [];

    const stream = provider.createStream(
      { encoding: "linear16" },
      {
        onOpen: () => {
          openCalls += 1;
        },
        onClose: () => {
          closeCalls += 1;
        },
        onTranscript: (transcript) => {
          transcripts.push(transcript);
        },
        onError: (error) => {
          errors.push(error as Error);
        },
      },
    );

    expect(transcriber.connectCalls).toBe(1);

    transcriber.emit("open", { type: "Begin" } as BeginEvent);
    transcriber.emit(
      "turn",
      createTurn({
        turn_is_formatted: false,
        end_of_turn: true,
        transcript: "ignore me",
      }),
    );
    transcriber.emit(
      "turn",
      createTurn({
        turn_is_formatted: true,
        end_of_turn: false,
        transcript: "still partial",
      }),
    );
    transcriber.emit(
      "turn",
      createTurn({
        turn_is_formatted: true,
        end_of_turn: true,
        transcript: "keep me",
      }),
    );

    const testError = new Error("transcriber boom");
    withSilentConsole(() => {
      transcriber.emit("error", testError);
      transcriber.emit("close", 1000, "normal");
    });

    expect(openCalls).toBe(1);
    expect(closeCalls).toBe(1);
    expect(errors).toEqual([testError]);
    expect(transcripts).toEqual([{ text: "keep me", isFinal: true }]);

    stream.close();
    expect(transcriber.closeCalls).toBe(1);
  });

  test("sends non-opus audio directly to transcriber", () => {
    const transcriber = new FakeTranscriber();
    let decoderFactoryCalls = 0;
    const provider = new AssemblyAISttProvider("test-key", {
      client: createClient(transcriber),
      createDecoder: () => {
        decoderFactoryCalls += 1;
        return new FakeDecoder();
      },
    });

    const stream = provider.createStream({ encoding: "linear16" }, {});

    const src = new Uint8Array([10, 20, 30, 40, 50]);
    const sliced = src.subarray(1, 4);
    stream.send(sliced);

    const arr = new Uint8Array([1, 2, 3, 4]).buffer;
    stream.send(arr);

    expect(decoderFactoryCalls).toBe(0);
    expect(transcriber.sentAudio).toHaveLength(2);

    const firstChunk = new Uint8Array(transcriber.sentAudio[0] as ArrayBuffer);
    expect(Array.from(firstChunk)).toEqual([20, 30, 40]);
    expect(transcriber.sentAudio[1]).toBe(arr);
  });

  test("decodes opus, buffers, emits 100ms chunks, and cleans up decoder", () => {
    const transcriber = new FakeTranscriber();
    const decoder = new FakeDecoder();
    let decoderFactoryCalls = 0;
    const errors: Error[] = [];

    const provider = new AssemblyAISttProvider("test-key", {
      client: createClient(transcriber),
      createDecoder: () => {
        decoderFactoryCalls += 1;
        return decoder;
      },
    });

    const stream = provider.createStream(
      { encoding: "opus" },
      {
        onError: (error) => {
          errors.push(error as Error);
        },
      },
    );

    const opusPacket = new Uint8Array([7, 8, 9]);
    stream.send(opusPacket);

    expect(decoderFactoryCalls).toBe(1);
    expect(decoder.writes).toHaveLength(1);
    expect(decoder.writes[0]).toBe(opusPacket);

    // 9600 bytes PCM -> 1600 bytes downsampled (below 3200-byte threshold)
    decoder.emit("data", Buffer.alloc(9600));
    expect(transcriber.sentAudio).toHaveLength(0);

    // Another 9600 bytes should flush one 3200-byte chunk
    decoder.emit("data", Buffer.alloc(9600));
    expect(transcriber.sentAudio).toHaveLength(1);
    expect(transcriber.sentAudio[0]?.byteLength).toBe(3200);

    const decoderError = new Error("decoder failed");
    decoder.emit("error", decoderError);
    expect(errors).toEqual([decoderError]);

    stream.close();
    expect(decoder.destroyCalls).toBe(1);
    expect(transcriber.closeCalls).toBe(1);
  });
});
