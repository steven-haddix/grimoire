import type { Readable } from "node:stream";
import { normalizeToDiscordPcm } from "../tts";
import type { TtsProvider, TtsRequest } from "../tts/types";

export class TtsService {
  constructor(private provider: TtsProvider) {}

  setProvider(provider: TtsProvider) {
    this.provider = provider;
  }

  getProviderName() {
    return this.provider.name;
  }

  async synthesizeToPcmStream(
    req: TtsRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<Readable> {
    const { stream, contentType } = await this.provider.synthesize(req, opts);
    return normalizeToDiscordPcm({ stream, contentType, signal: opts?.signal });
  }
}
