import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  type VoiceConnection,
} from "@discordjs/voice";
import type { TtsService } from "../services/tts-service";
import type { TtsVoiceConfig } from "../tts/types";

type SpeakJob = {
  text: string;
  voice: TtsVoiceConfig;
  resolve: () => void;
  reject: (err: unknown) => void;
};

export class GuildSpeechQueue {
  private queue: SpeakJob[] = [];
  private processing = false;
  private player = createAudioPlayer();
  private currentAbort: AbortController | null = null;

  constructor(
    private connection: VoiceConnection,
    private tts: TtsService,
    private opts: { maxQueue?: number } = {},
  ) {
    this.connection.subscribe(this.player);
  }

  speak(text: string, voice: TtsVoiceConfig): Promise<void> {
    const max = this.opts.maxQueue ?? 50;
    if (this.queue.length >= max) {
      return Promise.reject(new Error("TTS queue full"));
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ text, voice, resolve, reject });
      void this.processQueue();
    });
  }

  stopAll(reason = "stopped") {
    while (this.queue.length) {
      const job = this.queue.shift();
      if (job) job.reject(new Error(reason));
    }

    try {
      this.currentAbort?.abort();
    } catch {}
    this.currentAbort = null;

    try {
      this.player.stop(true);
    } catch {}
  }

  interrupt() {
    try {
      this.currentAbort?.abort();
    } catch {}
    this.currentAbort = null;

    try {
      this.player.stop(true);
    } catch {}
  }

  setConnection(connection: VoiceConnection) {
    this.connection = connection;
    this.connection.subscribe(this.player);
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        if (!job) continue;

        const ac = new AbortController();
        this.currentAbort = ac;

        try {
          const pcm = await this.tts.synthesizeToPcmStream(
            { text: job.text, voice: job.voice },
            { signal: ac.signal },
          );
          const resource = createAudioResource(pcm, {
            inputType: StreamType.Raw,
          });

          await new Promise<void>((resolve, reject) => {
            const onIdle = () => {
              cleanup();
              resolve();
            };
            const onError = (err: unknown) => {
              cleanup();
              reject(err);
            };

            const cleanup = () => {
              this.player.off(AudioPlayerStatus.Idle, onIdle);
              this.player.off("error", onError as () => void);
            };

            this.player.on(AudioPlayerStatus.Idle, onIdle);
            this.player.on("error", onError as () => void);
            this.player.play(resource);
          });

          job.resolve();
        } catch (err) {
          job.reject(err);
        } finally {
          this.currentAbort = null;
        }
      }
    } finally {
      this.processing = false;
    }
  }
}

const speechQueues = new Map<string, GuildSpeechQueue>();

export function getGuildSpeechQueue(params: {
  guildId: string;
  connection: VoiceConnection;
  tts: TtsService;
}) {
  const existing = speechQueues.get(params.guildId);
  if (existing) {
    existing.setConnection(params.connection);
    return existing;
  }

  const queue = new GuildSpeechQueue(params.connection, params.tts, {
    maxQueue: 50,
  });
  speechQueues.set(params.guildId, queue);
  return queue;
}

export function removeGuildSpeechQueue(guildId: string) {
  const queue = speechQueues.get(guildId);
  if (queue) queue.stopAll("queue removed");
  speechQueues.delete(guildId);
}
