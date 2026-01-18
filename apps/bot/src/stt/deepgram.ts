import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import type {
  SttProvider,
  SttStream,
  SttStreamHandlers,
  SttStreamParams,
} from "./types";

export class DeepgramSttProvider implements SttProvider {
  readonly name = "deepgram";
  private client: ReturnType<typeof createClient>;

  constructor(apiKey: string) {
    this.client = createClient(apiKey);
  }

  createStream(
    params: SttStreamParams,
    handlers: SttStreamHandlers,
  ): SttStream {
    const dgLive = this.client.listen.live({
      model: params.model ?? "nova-3",
      smart_format: params.smartFormat ?? true,
      encoding: params.encoding ?? "opus",
      sample_rate: params.sampleRate ?? 48000,
      channels: params.channels ?? 2,
      language: params.language ?? "en-US",
    });

    dgLive.on(LiveTranscriptionEvents.Open, () => {
      handlers.onOpen?.();
    });

    dgLive.on(LiveTranscriptionEvents.Transcript, (data) => {
      const text = data.channel?.alternatives?.[0]?.transcript ?? "";
      handlers.onTranscript?.({ text, isFinal: Boolean(data.is_final) });
    });

    dgLive.on(LiveTranscriptionEvents.Error, (error) => {
      handlers.onError?.(error);
    });

    dgLive.on(LiveTranscriptionEvents.Close, () => {
      handlers.onClose?.();
    });

    return {
      // biome-ignore lint/suspicious/noExplicitAny: data comes from Discord receiver
      send: (chunk: any) => {
        dgLive.send(chunk);
      },
      close: () => {
        dgLive.requestClose();
      },
    };
  }
}
