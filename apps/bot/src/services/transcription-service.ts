import type { Readable } from "node:stream";
import type { SttStream } from "../stt";
import type { SpeakerResolver, TranscriptSink } from "../types";
import type { SttService } from "./stt-service";

export class TranscriptionService {
  private sessionMap = new Map<string, number>();
  private speakerSessions = new Map<string, SpeakerSession>();

  constructor(
    private stt: SttService,
    private sink: TranscriptSink,
    private resolveSpeaker: SpeakerResolver,
  ) {}

  setSessionId(guildId: string, sessionId: number) {
    this.sessionMap.set(guildId, sessionId);
  }

  async clearSession(guildId: string) {
    this.sessionMap.delete(guildId);
    await this.closeGuildSpeakerSessions(guildId);
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
    const existingSession = this.speakerSessions.get(streamKey);
    if (existingSession && !existingSession.matchesSessionId(sessionId)) {
      void existingSession.close();
      this.speakerSessions.delete(streamKey);
    }

    const speakerSession =
      this.speakerSessions.get(streamKey) ??
      this.createSpeakerSession({
        streamKey,
        sessionId,
        guildId: params.guildId,
        userId: params.userId,
      });

    speakerSession.handleAudioStream(params.stream);
  }

  private async closeGuildSpeakerSessions(guildId: string) {
    const closePromises: Promise<void>[] = [];
    for (const [key, speakerSession] of this.speakerSessions) {
      if (!key.startsWith(`${guildId}:`)) continue;
      this.speakerSessions.delete(key);
      closePromises.push(speakerSession.close());
    }

    if (closePromises.length) {
      await Promise.allSettled(closePromises);
    }
  }

  private createSpeakerSession(params: {
    streamKey: string;
    sessionId: number;
    guildId: string;
    userId: string;
  }): SpeakerSession {
    let speakerSession: SpeakerSession;
    speakerSession = new SpeakerSession({
      ...params,
      stt: this.stt,
      sink: this.sink,
      resolveSpeaker: this.resolveSpeaker,
      onClosed: () => {
        if (this.speakerSessions.get(params.streamKey) === speakerSession) {
          this.speakerSessions.delete(params.streamKey);
        }
      },
    });

    this.speakerSessions.set(params.streamKey, speakerSession);
    return speakerSession;
  }
}

type SpeakerSessionState = "connecting" | "open" | "closed";

type SpeakerSessionParams = {
  streamKey: string;
  sessionId: number;
  guildId: string;
  userId: string;
  stt: SttService;
  sink: TranscriptSink;
  resolveSpeaker: SpeakerResolver;
  onClosed: () => void;
};

class SpeakerSession {
  private state: SpeakerSessionState = "connecting";
  private sttStream: SttStream | null = null;
  private pendingAudio: PendingAudio | null = null;
  private detachActiveAudio: (() => void) | null = null;
  private pendingIngests = new Set<Promise<void>>();
  private shutdownPromise: Promise<void> | null = null;
  private closed = false;

  constructor(private params: SpeakerSessionParams) {
    this.sttStream = params.stt.createStream({
      onOpen: () => {
        if (this.closed) return;
        this.state = "open";
        this.flushPendingAudio();
      },
      onTranscript: (result) => {
        if (!result.isFinal) return;
        const text = result.text.trim();
        if (!text) return;

        const speaker =
          this.params.resolveSpeaker(this.params.userId, this.params.guildId) ??
          "Unknown";

        const ingestPromise = this.params.sink
          .ingest({
            sessionId: this.params.sessionId,
            speaker,
            text,
            timestamp: new Date().toISOString(),
          })
          .catch((err) => console.error("Ingest failed", err));
        this.pendingIngests.add(ingestPromise);
        ingestPromise.finally(() => {
          this.pendingIngests.delete(ingestPromise);
        });
      },
      onError: (error) => {
        console.error("STT error", error);
        void this.shutdown(true);
      },
      onClose: () => {
        void this.shutdown(false);
      },
    });
  }

  matchesSessionId(sessionId: number) {
    return this.params.sessionId === sessionId;
  }

  handleAudioStream(stream: Readable) {
    if (this.closed) {
      destroyStream(stream);
      return;
    }

    // Swap out old stream — the new stream has fresh audio
    if (this.detachActiveAudio) {
      this.detachActiveAudio();
    }
    if (this.pendingAudio) {
      this.pendingAudio.detach();
      destroyStream(this.pendingAudio.stream);
      this.pendingAudio = null;
    }

    if (this.state === "open") {
      this.attachActiveAudio(stream);
      return;
    }

    this.pendingAudio = this.createPendingAudio(stream);
  }

  close() {
    return this.shutdown(true);
  }

  private flushPendingAudio() {
    const pending = this.pendingAudio;
    if (!pending) return;

    this.pendingAudio = null;
    pending.detach();

    if (!isReadableStreamOpen(pending.stream)) return;
    this.attachActiveAudio(pending.stream);
  }

  private createPendingAudio(stream: Readable): PendingAudio {
    let detached = false;

    const cleanup = () => {
      detach();
      if (this.pendingAudio?.stream === stream) {
        this.pendingAudio = null;
      }
    };

    const onEnd = cleanup;
    const onClose = cleanup;
    const onError = (err: unknown) => {
      console.error("Opus stream error", err);
      cleanup();
    };

    const detach = () => {
      if (detached) return;
      detached = true;
      stream.off("end", onEnd);
      stream.off("close", onClose);
      stream.off("error", onError);
    };

    stream.once("end", onEnd);
    stream.once("close", onClose);
    stream.once("error", onError);

    return { stream, detach };
  }

  private attachActiveAudio(stream: Readable) {
    const sttStream = this.sttStream;
    if (!sttStream) {
      destroyStream(stream);
      return;
    }

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;

      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("close", onClose);
      stream.off("error", onError);

      if (this.detachActiveAudio === cleanup) {
        this.detachActiveAudio = null;
      }

      destroyStream(stream);
    };

    // biome-ignore lint/suspicious/noExplicitAny: data comes from Discord receiver
    const onData = (chunk: any) => {
      try {
        sttStream.send(chunk);
      } catch (err) {
        console.error("STT send failed", err);
        cleanup();
        void this.shutdown(true);
      }
    };

    const onEnd = cleanup;
    const onClose = cleanup;
    const onError = (err: unknown) => {
      console.error("Opus stream error", err);
      cleanup();
    };

    this.detachActiveAudio = cleanup;
    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("close", onClose);
    stream.once("error", onError);
  }

  private async shutdown(shouldCloseStt: boolean) {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = (async () => {
      if (this.closed) return;
      this.closed = true;
      this.state = "closed";

      const pending = this.pendingAudio;
      this.pendingAudio = null;
      if (pending) {
        pending.detach();
        destroyStream(pending.stream);
      }

      const detachActiveAudio = this.detachActiveAudio;
      this.detachActiveAudio = null;
      detachActiveAudio?.();

      this.params.onClosed();

      const sttStream = this.sttStream;
      this.sttStream = null;
      if (shouldCloseStt) {
        try {
          await sttStream?.close();
        } catch {}
      }

      if (this.pendingIngests.size) {
        await Promise.allSettled(this.pendingIngests);
      }
    })();

    return this.shutdownPromise;
  }
}

type PendingAudio = {
  stream: Readable;
  detach: () => void;
};

function isReadableStreamOpen(stream: Readable) {
  return !stream.destroyed && !stream.readableEnded;
}

function destroyStream(stream: Readable) {
  try {
    stream.destroy();
  } catch {}
}
