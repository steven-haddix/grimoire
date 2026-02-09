import {
  AudioEncoding,
  type AudioFormat,
  type RealtimeEvent,
  RealtimeTranscription,
} from "@mistralai/mistralai/extra/realtime";
import { opus } from "prism-media";
import { downsample48kStereoTo16kMono } from "../audio-utils";
import type {
  SttProvider,
  SttStream,
  SttStreamHandlers,
  SttStreamParams,
} from "../types";

const DEFAULT_MODEL = "voxtral-mini-transcribe-realtime-2602";
const PCM16_MONO_16KHZ: AudioFormat = {
  encoding: AudioEncoding.PcmS16le,
  sampleRate: 16000,
};
const DEFAULT_SILENCE_TIMEOUT_MS = 1200;
const DEFAULT_MAX_QUEUE_BYTES = 512_000;
const DEFAULT_MAX_BUFFERED_TEXT_CHARS = 4_000;
const MEANINGFUL_TEXT_REGEX = /[\p{L}\p{N}]/u;
const TRAILING_PUNCTUATION_REGEX = /[.!?,;:)\]'"`]+$/u;
const LEADING_WORDISH_REGEX = /^[\p{L}\p{N}"'([{]/u;

type MistralRealtimeConnectOptions = {
  audioFormat?: AudioFormat;
  serverUrl?: string;
  timeoutMs?: number;
  httpHeaders?: Record<string, string>;
};

interface RealtimeConnectionLike extends AsyncIterable<RealtimeEvent> {
  readonly isClosed: boolean;
  sendAudio(audioBytes: Uint8Array | ArrayBuffer): Promise<void>;
  endAudio(): Promise<void>;
  close(code?: number, reason?: string): Promise<void>;
}

interface RealtimeClientLike {
  connect(
    model: string,
    options?: MistralRealtimeConnectOptions,
  ): Promise<RealtimeConnectionLike>;
}

interface DecoderLike {
  on(event: "data", listener: (pcm: Buffer) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  write(chunk: Uint8Array): void;
  destroy(): void;
}

type MistralRealtimeSttProviderDeps = {
  realtimeClient?: RealtimeClientLike;
  createDecoder?: () => DecoderLike;
};

export type MistralRealtimeSttProviderConfig = {
  model?: string;
  serverUrl?: string;
  connectTimeoutMs?: number;
  silenceTimeoutMs?: number;
  maxQueueBytes?: number;
  maxBufferedTextChars?: number;
};

export class MistralRealtimeSttProvider implements SttProvider {
  readonly name = "mistral-realtime";

  private realtimeClient: RealtimeClientLike;
  private createDecoder: () => DecoderLike;
  private defaultModel: string;
  private serverUrl: string | undefined;
  private connectTimeoutMs: number | undefined;
  private silenceTimeoutMs: number;
  private maxQueueBytes: number;
  private maxBufferedTextChars: number;

  constructor(
    apiKey: string,
    config?: MistralRealtimeSttProviderConfig,
    deps?: MistralRealtimeSttProviderDeps,
  ) {
    this.realtimeClient =
      deps?.realtimeClient ?? new RealtimeTranscription({ apiKey });
    this.createDecoder =
      deps?.createDecoder ??
      (() =>
        new opus.Decoder({
          rate: 48000,
          channels: 2,
          frameSize: 960,
        }));
    this.defaultModel = config?.model ?? DEFAULT_MODEL;
    this.serverUrl = config?.serverUrl;
    this.connectTimeoutMs = config?.connectTimeoutMs;
    this.silenceTimeoutMs =
      config?.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS;
    this.maxQueueBytes = config?.maxQueueBytes ?? DEFAULT_MAX_QUEUE_BYTES;
    this.maxBufferedTextChars =
      config?.maxBufferedTextChars ?? DEFAULT_MAX_BUFFERED_TEXT_CHARS;
  }

  createStream(
    params: SttStreamParams,
    handlers: SttStreamHandlers,
  ): SttStream {
    const model = params.model ?? this.defaultModel;
    const useOpusDecoder = params.encoding === "opus";

    let acceptingAudio = true;
    let stopRequested = false;
    let closeEmitted = false;
    let connectPromise: Promise<void> | null = null;
    let closingPromise: Promise<void> | null = null;
    let connection: RealtimeConnectionLike | null = null;
    let pumpPromise: Promise<void> | null = null;
    let eventLoopPromise: Promise<void> | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let emittedTranscriptCount = 0;
    let hasSeenSegment = false;
    let partialText = "";
    let lastCommittedText = "";
    let pendingPunctuation = "";
    const turnSegments: string[] = [];

    const sendQueue: Uint8Array[] = [];
    let queuedBytes = 0;

    const emitClose = () => {
      if (closeEmitted) return;
      closeEmitted = true;
      handlers.onClose?.();
    };

    const clearSilenceTimer = () => {
      if (!silenceTimer) return;
      clearTimeout(silenceTimer);
      silenceTimer = null;
    };

    const emitTranscript = (text: string) => {
      const normalized = text.replace(/\s+/g, " ").trim();
      if (!normalized) return;
      if (!MEANINGFUL_TEXT_REGEX.test(normalized)) {
        pendingPunctuation = `${pendingPunctuation} ${normalized}`
          .replace(/\s+/g, " ")
          .trim();
        if (pendingPunctuation.length > 64) {
          pendingPunctuation = pendingPunctuation.slice(-64);
        }
        return;
      }

      const shouldInsertSpace =
        pendingPunctuation.length > 0 &&
        TRAILING_PUNCTUATION_REGEX.test(pendingPunctuation) &&
        LEADING_WORDISH_REGEX.test(normalized);
      const committed =
        `${pendingPunctuation}${shouldInsertSpace ? " " : ""}${normalized}`
          .replace(/\s+/g, " ")
          .trim();
      pendingPunctuation = "";

      if (!committed) return;
      if (committed === lastCommittedText) return;
      lastCommittedText = committed;
      emittedTranscriptCount += 1;
      handlers.onTranscript?.({ text: committed, isFinal: true });
    };

    const flushTurn = (allowPartialFallback: boolean) => {
      clearSilenceTimer();

      if (turnSegments.length > 0) {
        emitTranscript(turnSegments.join(" "));
        turnSegments.length = 0;
        partialText = "";
        return;
      }

      if (!allowPartialFallback) {
        partialText = "";
        return;
      }

      const fallback = partialText.replace(/\s+/g, " ").trim();
      partialText = "";
      if (fallback) {
        emitTranscript(fallback);
      }
    };

    const scheduleSilenceFlush = () => {
      if (stopRequested || !acceptingAudio) return;
      clearSilenceTimer();
      silenceTimer = setTimeout(() => {
        flushTurn(!hasSeenSegment);
      }, this.silenceTimeoutMs);
    };

    const closeStream = async () => {
      if (closingPromise) return closingPromise;

      closingPromise = (async () => {
        stopRequested = true;
        acceptingAudio = false;
        clearSilenceTimer();
        flushTurn(true);
        decoder?.destroy();

        await connectPromise?.catch(() => undefined);

        const liveConnection = connection;
        if (
          liveConnection &&
          !liveConnection.isClosed &&
          sendQueue.length > 0
        ) {
          await pumpSendQueue(liveConnection, true);
        }

        await pumpPromise?.catch(() => undefined);

        if (liveConnection && !liveConnection.isClosed) {
          await liveConnection.endAudio().catch(() => undefined);
          await liveConnection.close().catch(() => undefined);
        }

        await eventLoopPromise?.catch(() => undefined);

        emitClose();
      })();

      return closingPromise;
    };

    const failStream = (error: unknown) => {
      if (stopRequested) return;
      const wrappedError =
        error instanceof Error
          ? error
          : new Error(String(error ?? "Realtime stream failure"));
      handlers.onError?.(wrappedError);
      void closeStream();
    };

    const enqueueAudio = (chunk: Uint8Array) => {
      if (!acceptingAudio || chunk.byteLength === 0) return;

      const cloned = new Uint8Array(chunk.byteLength);
      cloned.set(chunk);

      sendQueue.push(cloned);
      queuedBytes += cloned.byteLength;

      if (queuedBytes > this.maxQueueBytes) {
        failStream(
          new Error(
            `Mistral realtime queue overflowed ${this.maxQueueBytes} bytes; closing stream to avoid transcript corruption.`,
          ),
        );
        return;
      }

      scheduleSilenceFlush();

      if (!pumpPromise && connection && !connection.isClosed) {
        pumpPromise = pumpSendQueue(connection, false);
      }
    };

    const pumpSendQueue = async (
      liveConnection: RealtimeConnectionLike,
      force: boolean,
    ) => {
      try {
        while (
          sendQueue.length > 0 &&
          !liveConnection.isClosed &&
          (force || !stopRequested)
        ) {
          const next = sendQueue.shift();
          if (!next) continue;
          queuedBytes -= next.byteLength;
          await liveConnection.sendAudio(next);
        }
      } catch (error) {
        if (!stopRequested) {
          failStream(error);
        }
      } finally {
        if (pumpPromise) {
          pumpPromise = null;
        }

        if (
          sendQueue.length > 0 &&
          connection === liveConnection &&
          !liveConnection.isClosed &&
          !stopRequested
        ) {
          pumpPromise = pumpSendQueue(liveConnection, false);
        }
      }
    };

    const handleRealtimeEvent = (event: RealtimeEvent) => {
      const type = (event as { type?: unknown }).type;
      if (typeof type !== "string") return;

      if (type === "transcription.text.delta") {
        const delta = (event as { text?: unknown }).text;
        if (typeof delta !== "string" || !delta) return;

        partialText += delta;
        if (partialText.length >= this.maxBufferedTextChars) {
          if (!hasSeenSegment) {
            flushTurn(true);
          } else {
            partialText = partialText.slice(-this.maxBufferedTextChars);
          }
          return;
        }

        scheduleSilenceFlush();
        return;
      }

      if (type === "transcription.segment") {
        const text = (event as { text?: unknown }).text;
        hasSeenSegment = true;

        if (typeof text === "string") {
          const cleaned = text.replace(/\s+/g, " ").trim();
          if (cleaned) {
            turnSegments.push(cleaned);
          }
        }

        // Segments are the committed source of truth. Drop uncommitted delta text.
        partialText = "";
        scheduleSilenceFlush();
        return;
      }

      if (type === "transcription.done") {
        flushTurn(true);
        if (emittedTranscriptCount === 0) {
          const fallback = (event as { text?: unknown }).text;
          if (typeof fallback === "string") {
            emitTranscript(fallback);
          }
        }
        return;
      }

      if (type === "error") {
        const details = (event as { error?: unknown }).error;
        failStream(details ?? event);
      }
    };

    const runEventLoop = async (liveConnection: RealtimeConnectionLike) => {
      try {
        for await (const event of liveConnection) {
          if (stopRequested) break;
          handleRealtimeEvent(event);
        }
      } catch (error) {
        if (!stopRequested) {
          failStream(error);
        }
      } finally {
        if (!stopRequested) {
          flushTurn(true);
          emitClose();
        }
      }
    };

    const connect = async () => {
      try {
        const liveConnection = await this.realtimeClient.connect(model, {
          audioFormat: PCM16_MONO_16KHZ,
          serverUrl: this.serverUrl,
          timeoutMs: this.connectTimeoutMs,
        });

        if (stopRequested) {
          await liveConnection.close().catch(() => undefined);
          emitClose();
          return;
        }

        connection = liveConnection;
        handlers.onOpen?.();

        eventLoopPromise = runEventLoop(liveConnection);

        if (sendQueue.length > 0 && !pumpPromise) {
          pumpPromise = pumpSendQueue(liveConnection, false);
        }
      } catch (error) {
        if (!stopRequested) {
          failStream(error);
        }
      }
    };

    const decoder = useOpusDecoder ? this.createDecoder() : null;
    if (decoder) {
      decoder.on("data", (pcm48kStereo: Buffer) => {
        enqueueAudio(downsample48kStereoTo16kMono(pcm48kStereo));
      });

      decoder.on("error", (error: Error) => {
        failStream(error);
      });
    }

    connectPromise = connect();

    return {
      send: (chunk: Uint8Array | ArrayBuffer) => {
        if (!acceptingAudio) return;
        if (decoder) {
          const opusChunk =
            chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          decoder.write(opusChunk);
          return;
        }

        enqueueAudio(
          chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk),
        );
      },
      close: closeStream,
    };
  }
}
