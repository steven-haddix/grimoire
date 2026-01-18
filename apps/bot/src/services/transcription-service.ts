import type { Readable } from "node:stream";
import type { SttStream } from "../stt";
import type { SpeakerResolver, TranscriptSink } from "../types";
import { SttService } from "./stt-service";

export class TranscriptionService {
  private sessionMap = new Map<string, number>();
  private activeStreams = new Set<string>();

  constructor(
    private stt: SttService,
    private sink: TranscriptSink,
    private resolveSpeaker: SpeakerResolver,
  ) {}

  setSessionId(guildId: string, sessionId: number) {
    this.sessionMap.set(guildId, sessionId);
  }

  clearSession(guildId: string) {
    this.sessionMap.delete(guildId);
    this.clearActiveStreams(guildId);
  }

  hasSession(guildId: string) {
    return this.sessionMap.has(guildId);
  }

  getSessionId(guildId: string) {
    return this.sessionMap.get(guildId);
  }

  handleUserStream(params: {
    guildId: string;
    userId: string;
    stream: Readable;
  }) {
    const sessionId = this.sessionMap.get(params.guildId);
    if (!sessionId) return;

    const streamKey = `${params.guildId}:${params.userId}`;
    if (this.activeStreams.has(streamKey)) return;

    this.activeStreams.add(streamKey);
    this.processStream({
      streamKey,
      sessionId,
      userId: params.userId,
      stream: params.stream,
    });
  }

  private clearActiveStreams(guildId: string) {
    for (const key of this.activeStreams) {
      if (key.startsWith(`${guildId}:`)) {
        this.activeStreams.delete(key);
      }
    }
  }

  private processStream(params: {
    streamKey: string;
    sessionId: number;
    userId: string;
    stream: Readable;
  }) {
    let cleanedUp = false;
    let sttStream: SttStream | null = null;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      this.activeStreams.delete(params.streamKey);
      try {
        params.stream.destroy();
      } catch {}
      try {
        sttStream?.close();
      } catch {}
    };

    // biome-ignore lint/suspicious/noExplicitAny: data comes from Discord receiver
    const onData = (chunk: any) => {
      try {
        sttStream?.send(chunk);
      } catch (err) {
        console.error("STT send failed", err);
        cleanup();
      }
    };

    sttStream = this.stt.createStream({
      onOpen: () => {
        params.stream.on("data", onData);
        params.stream.once("end", cleanup);
        params.stream.once("error", (err) => {
          console.error("Opus stream error", err);
          cleanup();
        });
      },
      onTranscript: (result) => {
        if (!result.isFinal) return;
        const text = result.text.trim();
        if (!text) return;

        const speaker = this.resolveSpeaker(params.userId) ?? "Unknown";
        this.sink
          .ingest({
            sessionId: params.sessionId,
            speaker,
            text,
            timestamp: new Date().toISOString(),
          })
          .catch((err) => console.error("Ingest failed", err));
      },
      onError: (error) => {
        console.error("STT error", error);
        cleanup();
      },
      onClose: cleanup,
    });
  }
}
