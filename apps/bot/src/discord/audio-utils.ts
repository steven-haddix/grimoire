import { Transform, type TransformCallback } from "node:stream";

export class BufferedAudioStream extends Transform {
  private buffer: Buffer[] = [];
  private bufferSize = 0;
  private hasFlushed = false;
  private readonly targetBufferSize: number;
  private readonly silenceBytes: number;

  constructor(
    options: {
      highWaterMark?: number;
      bufferDurationMs?: number; // How much audio to buffer before starting (jitter buffer)
      silenceDurationMs?: number; // How much silence to prepend
      sampleRate?: number;
      channels?: number;
      bitDepth?: number;
    } = {},
  ) {
    super(options);

    const sampleRate = options.sampleRate ?? 48000;
    const channels = options.channels ?? 2;
    const bitDepth = options.bitDepth ?? 16;
    const bytesPerSecond = sampleRate * channels * (bitDepth / 8);

    // Default buffer 300ms - enough to cover minor network jitter without too much latency
    const bufferMs = options.bufferDurationMs ?? 300;
    this.targetBufferSize = Math.floor((bufferMs / 1000) * bytesPerSecond);

    // Default silence 200ms - helps with "first word cut off" issues
    const silenceMs = options.silenceDurationMs ?? 200;
    this.silenceBytes = Math.floor((silenceMs / 1000) * bytesPerSecond);
  }

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ) {
    if (this.hasFlushed) {
      this.push(chunk);
      callback();
      return;
    }

    this.buffer.push(chunk);
    this.bufferSize += chunk.length;

    if (this.bufferSize >= this.targetBufferSize) {
      this.flushBuffer();
    }

    callback();
  }

  override _flush(callback: TransformCallback) {
    if (!this.hasFlushed) {
      this.flushBuffer();
    }
    callback();
  }

  private flushBuffer() {
    this.hasFlushed = true;

    if (this.silenceBytes > 0) {
      this.push(Buffer.alloc(this.silenceBytes));
    }

    for (const chunk of this.buffer) {
      this.push(chunk);
    }
    this.buffer = [];
    this.bufferSize = 0;
  }
}
