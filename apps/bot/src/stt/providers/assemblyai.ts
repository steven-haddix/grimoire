import { AssemblyAI, type BeginEvent, type TurnEvent } from "assemblyai";
import { opus } from "prism-media";
import type {
  SttProvider,
  SttStream,
  SttStreamHandlers,
  SttStreamParams,
} from "../types";

export class AssemblyAISttProvider implements SttProvider {
  readonly name = "assemblyai";
  private client: AssemblyAI;

  constructor(apiKey: string) {
    this.client = new AssemblyAI({ apiKey });
  }

  createStream(
    params: SttStreamParams,
    handlers: SttStreamHandlers,
  ): SttStream {
    const preferFormattedTurns = true;
    const transcriber = this.client.streaming.transcriber({
      sampleRate: 16000,
      formatTurns: preferFormattedTurns,
    });

    const isOpus = params.encoding === "opus";
    let decoder: opus.Decoder | null = null;
    const targetChunkMs = 100;
    const bytesPerSecond = 16000 * 2; // 16kHz mono, 16-bit
    const targetChunkBytes = Math.floor(
      (bytesPerSecond * targetChunkMs) / 1000,
    );
    let pcmBuffer = Buffer.alloc(0);

    if (isOpus) {
      decoder = new opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });

      decoder.on("data", (pcm: Buffer) => {
        // Downsample 48kHz Stereo to 16kHz Mono
        const downsampled = Buffer.alloc(pcm.length / 6);
        let j = 0;
        for (let i = 0; i < pcm.length; i += 12) {
          if (j + 1 < downsampled.length) {
            const sample = pcm.readInt16LE(i);
            downsampled.writeInt16LE(sample, j);
            j += 2;
          }
        }
        pcmBuffer = Buffer.concat([pcmBuffer, downsampled]);

        while (pcmBuffer.length >= targetChunkBytes) {
          const chunk = pcmBuffer.subarray(0, targetChunkBytes);
          pcmBuffer = pcmBuffer.subarray(targetChunkBytes);
          // transcriber.sendAudio expects ArrayBufferLike
          const chunkArrayBuffer = chunk.buffer.slice(
            chunk.byteOffset,
            chunk.byteOffset + chunk.byteLength,
          );
          transcriber.sendAudio(chunkArrayBuffer);
        }
      });

      decoder.on("error", (err: Error) => {
        handlers.onError?.(err);
      });
    }

    transcriber.on("open", (_event: BeginEvent) => {
      handlers.onOpen?.();
    });

    transcriber.on("turn", (turn: TurnEvent) => {
      if (preferFormattedTurns && !turn.turn_is_formatted) return;
      if (!preferFormattedTurns && turn.turn_is_formatted) return;
      if (turn.end_of_turn && turn.transcript) {
        handlers.onTranscript?.({
          text: turn.transcript,
          isFinal: turn.end_of_turn,
        });
      }
    });

    transcriber.on("error", (error: Error) => {
      console.error("Transcriber error", error);
      handlers.onError?.(error);
    });

    transcriber.on("close", (_code: number, _reasonn: string) => {
      console.debug("Transcriber closed", _code, _reasonn);
      handlers.onClose?.();
    });

    transcriber.connect();

    return {
      send: (chunk: Uint8Array | ArrayBuffer) => {
        if (decoder) {
          const buf =
            chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          decoder.write(buf);
        } else {
          const data =
            chunk instanceof ArrayBuffer
              ? chunk
              : chunk.buffer.slice(
                  (chunk as Uint8Array).byteOffset,
                  (chunk as Uint8Array).byteOffset +
                    (chunk as Uint8Array).byteLength,
                );
          transcriber.sendAudio(data);
        }
      },
      close: () => {
        decoder?.destroy();
        transcriber.close();
      },
    };
  }
}
