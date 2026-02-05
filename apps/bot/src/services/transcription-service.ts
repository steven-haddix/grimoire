import type { Readable } from "node:stream";
import type { SttStream } from "../stt";
import type { SpeakerResolver, TranscriptSink } from "../types";
import type { SttService } from "./stt-service";

export class TranscriptionService {
  private sessionMap = new Map<string, number>();
  private activeStreams = new Set<string>();
  private sttStreams = new Map<string, SttStream>();
  private sttOpen = new Set<string>();
  private pendingAudio = new Map<string, PendingAudio[]>();

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
    this.closeGuildSttStreams(guildId);
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

    const sttStream =
      this.sttStreams.get(streamKey) ??
      this.createSttStream({
        streamKey,
        sessionId,
        guildId: params.guildId,
        userId: params.userId,
      });

    this.activeStreams.add(streamKey);

    const audioParams: PendingAudio = {
      streamKey,
      sessionId,
      guildId: params.guildId,
      userId: params.userId,
      stream: params.stream,
    };

    if (this.sttOpen.has(streamKey)) {
      this.attachAudioStream(audioParams, sttStream);
    } else {
      const pending = this.pendingAudio.get(streamKey) ?? [];
      pending.push(audioParams);
      this.pendingAudio.set(streamKey, pending);
    }
  }

  private clearActiveStreams(guildId: string) {
    for (const key of this.activeStreams) {
      if (key.startsWith(`${guildId}:`)) {
        this.activeStreams.delete(key);
      }
    }
  }

  private closeGuildSttStreams(guildId: string) {
    for (const [key, sttStream] of this.sttStreams) {
      if (!key.startsWith(`${guildId}:`)) continue;
      this.sttStreams.delete(key);
      this.sttOpen.delete(key);
      const pending = this.pendingAudio.get(key);
      if (pending) {
        for (const audio of pending) {
          try {
            audio.stream.destroy();
          } catch {}
        }
      }
      this.pendingAudio.delete(key);
      try {
        sttStream.close();
      } catch {}
    }
  }

  private createSttStream(params: {
    streamKey: string;
    sessionId: number;
    guildId: string;
    userId: string;
  }): SttStream {
    const sttStream = this.stt.createStream({
      onOpen: () => {
        this.sttOpen.add(params.streamKey);
        const pending = this.pendingAudio.get(params.streamKey);
        if (!pending?.length) return;
        this.pendingAudio.delete(params.streamKey);
        for (const audio of pending) {
          this.attachAudioStream(audio, sttStream);
        }
      },
      onTranscript: (result) => {
        if (!result.isFinal) return;
        const text = result.text.trim();
        if (!text) return;

        const speaker =
          this.resolveSpeaker(params.userId, params.guildId) ?? "Unknown";
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
        this.teardownSttStream(params.streamKey, true);
      },
      onClose: () => {
        this.teardownSttStream(params.streamKey, false);
      },
    });

    this.sttStreams.set(params.streamKey, sttStream);
    return sttStream;
  }

  private teardownSttStream(streamKey: string, shouldClose: boolean) {
    const sttStream = this.sttStreams.get(streamKey);
    if (!sttStream) return;
    this.sttStreams.delete(streamKey);
    this.sttOpen.delete(streamKey);
    this.pendingAudio.delete(streamKey);
    this.activeStreams.delete(streamKey);
    if (shouldClose) {
      try {
        sttStream.close();
      } catch {}
    }
  }

  private attachAudioStream(params: PendingAudio, sttStream: SttStream) {
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      this.activeStreams.delete(params.streamKey);
      try {
        params.stream.destroy();
      } catch {}
    };

    // biome-ignore lint/suspicious/noExplicitAny: data comes from Discord receiver
    const onData = (chunk: any) => {
      try {
        sttStream.send(chunk);
      } catch (err) {
        console.error("STT send failed", err);
        cleanup();
        this.teardownSttStream(params.streamKey, true);
      }
    };

    params.stream.on("data", onData);
    params.stream.once("end", cleanup);
    params.stream.once("error", (err) => {
      console.error("Opus stream error", err);
      cleanup();
    });
  }
}

type PendingAudio = {
  streamKey: string;
  sessionId: number;
  guildId: string;
  userId: string;
  stream: Readable;
};
