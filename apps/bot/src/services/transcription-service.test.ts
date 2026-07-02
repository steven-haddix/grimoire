import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import type { SttStreamHandlers } from "../stt";
import type { TranscriptSink } from "../types";
import type { SttService } from "./stt-service";
import { TranscriptionService } from "./transcription-service";

type FakeCreatedStream = {
  handlers: SttStreamHandlers;
  sentChunks: Array<Uint8Array | ArrayBuffer>;
  closeCalls: number;
};

function createFakeSttService() {
  const createdStreams: FakeCreatedStream[] = [];

  const stt = {
    createStream(handlers: SttStreamHandlers) {
      const created: FakeCreatedStream = {
        handlers,
        sentChunks: [],
        closeCalls: 0,
      };
      createdStreams.push(created);

      return {
        send(chunk: Uint8Array | ArrayBuffer) {
          created.sentChunks.push(chunk);
        },
        async close() {
          created.closeCalls += 1;
        },
      };
    },
  };

  return {
    sttService: stt as unknown as SttService,
    createdStreams,
  };
}

function createSink(calls: Array<Parameters<TranscriptSink["ingest"]>[0]>) {
  return {
    ingest: async (input: Parameters<TranscriptSink["ingest"]>[0]) => {
      calls.push(input);
    },
  } satisfies TranscriptSink;
}

describe("TranscriptionService", () => {
  test("accepts a later stream when first stream ends before STT opens", () => {
    const { sttService, createdStreams } = createFakeSttService();
    const sinkCalls: Array<Parameters<TranscriptSink["ingest"]>[0]> = [];

    const service = new TranscriptionService(
      sttService,
      createSink(sinkCalls),
      () => "Speaker",
    );

    service.setSessionId("guild-1", 42);

    const firstStream = new PassThrough();
    service.handleUserStream({
      guildId: "guild-1",
      userId: "user-1",
      stream: firstStream,
    });
    firstStream.destroy();

    expect(createdStreams).toHaveLength(1);
    createdStreams[0]?.handlers.onOpen?.();

    const secondStream = new PassThrough();
    service.handleUserStream({
      guildId: "guild-1",
      userId: "user-1",
      stream: secondStream,
    });

    secondStream.write(Buffer.from([1, 2, 3]));

    expect(createdStreams[0]?.sentChunks).toHaveLength(1);
    secondStream.end();
    expect(sinkCalls).toHaveLength(0);
  });

  test("clearSession tears down pending streams and closes active STT session", async () => {
    const { sttService, createdStreams } = createFakeSttService();
    const sinkCalls: Array<Parameters<TranscriptSink["ingest"]>[0]> = [];

    const service = new TranscriptionService(
      sttService,
      createSink(sinkCalls),
      () => "Speaker",
    );

    service.setSessionId("guild-2", 50);

    const pendingStream = new PassThrough();
    service.handleUserStream({
      guildId: "guild-2",
      userId: "user-2",
      stream: pendingStream,
    });

    expect(createdStreams).toHaveLength(1);
    await service.clearSession("guild-2");

    expect(pendingStream.destroyed).toBe(true);
    expect(createdStreams[0]?.closeCalls).toBe(1);
    expect(service.hasSession("guild-2")).toBe(false);
    expect(sinkCalls).toHaveLength(0);
  });

  test("ingests only final non-empty transcripts", async () => {
    const { sttService, createdStreams } = createFakeSttService();
    const sinkCalls: Array<Parameters<TranscriptSink["ingest"]>[0]> = [];

    const service = new TranscriptionService(
      sttService,
      createSink(sinkCalls),
      () => "DM",
    );

    service.setSessionId("guild-3", 99);

    const stream = new PassThrough();
    service.handleUserStream({
      guildId: "guild-3",
      userId: "user-3",
      stream,
    });

    const created = createdStreams[0];
    created?.handlers.onOpen?.();
    created?.handlers.onTranscript?.({ text: "  hello ", isFinal: false });
    created?.handlers.onTranscript?.({ text: "   ", isFinal: true });
    created?.handlers.onTranscript?.({ text: "  hello ", isFinal: true });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sinkCalls).toHaveLength(1);
    expect(sinkCalls[0]?.sessionId).toBe(99);
    expect(sinkCalls[0]?.speaker).toBe("DM");
    expect(sinkCalls[0]?.speakerUserId).toBe("user-3");
    expect(sinkCalls[0]?.text).toBe("hello");
    expect(typeof sinkCalls[0]?.timestamp).toBe("string");
  });

  test("creates a new STT stream after provider error", () => {
    const { sttService, createdStreams } = createFakeSttService();

    const service = new TranscriptionService(
      sttService,
      createSink([]),
      () => "Speaker",
    );

    service.setSessionId("guild-4", 77);

    const firstStream = new PassThrough();
    service.handleUserStream({
      guildId: "guild-4",
      userId: "user-4",
      stream: firstStream,
    });

    expect(createdStreams).toHaveLength(1);
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      createdStreams[0]?.handlers.onError?.(new Error("boom"));
    } finally {
      console.error = originalConsoleError;
    }

    const secondStream = new PassThrough();
    service.handleUserStream({
      guildId: "guild-4",
      userId: "user-4",
      stream: secondStream,
    });

    expect(createdStreams).toHaveLength(2);
    expect(createdStreams[0]?.closeCalls).toBe(1);
  });
});
