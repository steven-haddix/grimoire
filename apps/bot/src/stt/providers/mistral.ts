import { Mistral } from "@mistralai/mistralai";
import { opus } from "prism-media";
import { downsample48kStereoTo16kMono } from "../audio-utils";
import type {
  SttProvider,
  SttStream,
  SttStreamHandlers,
  SttStreamParams,
} from "../types";

const DEFAULT_MODEL = "voxtral-mini-latest";
const PCM16_MONO_16KHZ_SAMPLE_RATE = 16000;
const MIN_FLUSH_BYTES = 32_000; // ~1s of 16kHz mono 16-bit PCM
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

export type MistralSttProviderConfig = {
  flushIntervalMs?: number;
  contextBias?: string[];
};

interface DecoderLike {
  on(event: "data", listener: (pcm: Buffer) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  write(chunk: Uint8Array): void;
  destroy(): void;
}

export interface TranscriptionClientLike {
  complete(request: {
    model: string;
    file: { fileName: string; content: Uint8Array };
    language?: string | null;
    contextBias?: string[];
  }): Promise<{ text: string }>;
}

type MistralSttProviderDeps = {
  transcriptionClient?: TranscriptionClientLike;
  createDecoder?: () => DecoderLike;
};

export class MistralSttProvider implements SttProvider {
  readonly name = "mistral";

  private transcriptionClient: TranscriptionClientLike;
  private createDecoder: () => DecoderLike;
  private flushIntervalMs: number;
  private contextBias: string[] | undefined;

  constructor(
    apiKey: string,
    config?: MistralSttProviderConfig,
    deps?: MistralSttProviderDeps,
  ) {
    const client = deps?.transcriptionClient;
    this.transcriptionClient =
      client ?? new Mistral({ apiKey }).audio.transcriptions;
    this.createDecoder =
      deps?.createDecoder ??
      (() =>
        new opus.Decoder({
          rate: 48000,
          channels: 2,
          frameSize: 960,
        }));
    this.flushIntervalMs = config?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.contextBias = config?.contextBias;
  }

  createStream(
    params: SttStreamParams,
    handlers: SttStreamHandlers,
  ): SttStream {
    const model = params.model ?? DEFAULT_MODEL;
    const language = toAlpha2(params.language) ?? undefined;
    const contextBias = this.contextBias;
    const useOpusDecoder = params.encoding === "opus";

    let closeRequested = false;
    let activeFlush: Promise<void> | null = null;
    const pcmChunks: Buffer[] = [];
    let pcmByteLength = 0;

    const doFlush = async (chunks: Buffer[], byteLen: number) => {
      try {
        const pcm = Buffer.concat(chunks, byteLen);
        const wav = createWavBuffer(pcm, PCM16_MONO_16KHZ_SAMPLE_RATE);

        const result = await this.transcriptionClient.complete({
          model,
          file: {
            fileName: "chunk.wav",
            content: new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength),
          },
          language,
          contextBias,
        });

        const text = result.text.trim();
        if (text) {
          handlers.onTranscript?.({ text, isFinal: true });
        }
      } catch (error) {
        handlers.onError?.(error);
      }
    };

    const flushBuffered = (force = false): Promise<void> | null => {
      if (activeFlush) return activeFlush;
      if (pcmByteLength === 0) return null;
      if (!force && pcmByteLength < MIN_FLUSH_BYTES) return null;

      const chunks = pcmChunks.splice(0);
      const byteLen = pcmByteLength;
      pcmByteLength = 0;

      const flushPromise = doFlush(chunks, byteLen).catch(() => {}).finally(() => {
        if (activeFlush === flushPromise) {
          activeFlush = null;
        }
      });
      activeFlush = flushPromise;
      return flushPromise;
    };

    const appendPcm = (pcm: Buffer) => {
      if (closeRequested) return;
      pcmChunks.push(pcm);
      pcmByteLength += pcm.length;
    };

    const decoder = useOpusDecoder ? this.createDecoder() : null;
    if (decoder) {
      decoder.on("data", (pcm48kStereo: Buffer) => {
        appendPcm(downsample48kStereoTo16kMono(pcm48kStereo));
      });

      decoder.on("error", (error: Error) => {
        handlers.onError?.(error);
      });
    }

    const flushTimer = setInterval(() => {
      if (closeRequested) return;
      void flushBuffered();
    }, this.flushIntervalMs);

    handlers.onOpen?.();

    return {
      send: (chunk: Uint8Array | ArrayBuffer) => {
        if (closeRequested) return;
        if (decoder) {
          const buf =
            chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          decoder.write(buf);
          return;
        }

        const buf =
          chunk instanceof Uint8Array
            ? Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
            : Buffer.from(chunk);
        appendPcm(buf);
      },
      close: async () => {
        if (closeRequested) return;
        closeRequested = true;
        clearInterval(flushTimer);
        decoder?.destroy();

        // Wait for any in-flight transcription, then force-flush remaining buffered audio.
        if (activeFlush) {
          await activeFlush;
        }
        await flushBuffered(true);

        handlers.onClose?.();
      },
    };
  }
}

/** Convert a BCP 47 locale tag (e.g. "en-US") to an ISO 639-1 alpha-2 code ("en"). */
function toAlpha2(lang: string | undefined | null): string | undefined {
  if (!lang) return undefined;
  return lang.split("-")[0]?.toLowerCase();
}

function createWavBuffer(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const headerSize = 44;

  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt subchunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // subchunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data subchunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcm.copy(buffer, headerSize);

  return buffer;
}
