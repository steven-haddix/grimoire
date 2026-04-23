import type { Readable } from "node:stream";
import { normalizeToDiscordPcm } from "../tts";
import type { TtsProvider, TtsRequest } from "../tts/types";
import type { VoicePersonaManager } from "../tts/voice-personas";

export class TtsService {
  private providers = new Map<string, TtsProvider>();

  constructor(private personaManager: VoicePersonaManager) {}

  registerProvider(provider: TtsProvider) {
    this.providers.set(provider.name, provider);
  }

  getProviderName(personaName: string) {
    const { provider } = this.personaManager.resolvePersona(personaName);
    return provider;
  }

  async synthesizeToPcmStream(
    req: TtsRequest,
    opts?: { signal?: AbortSignal },
  ): Promise<Readable> {
    // Treat req.voice.voice as the persona name
    const personaName = req.voice.voice;
    const { provider: providerName, voiceConfig } =
      this.personaManager.resolvePersona(personaName);

    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(
        `TTS Provider '${providerName}' not configured (requested by persona '${personaName}')`,
      );
    }

    // Use the resolved configuration
    const realReq: TtsRequest = {
      ...req,
      voice: voiceConfig,
    };

    const { stream, contentType } = await provider.synthesize(realReq, opts);
    return normalizeToDiscordPcm({ stream, contentType, signal: opts?.signal });
  }
}
