import fs from "node:fs";
import path from "node:path";
import type { TtsVoiceConfig } from "./types";

export type PersonaConfig = {
  provider: string;
  voiceId: string;
  options?: Record<string, unknown>;
};

export type VoicePersonaMap = {
  default: string;
  personas: Record<string, PersonaConfig>;
};

export class VoicePersonaManager {
  private config: VoicePersonaMap;

  constructor(configPath?: string) {
    const defaultPath = path.join(process.cwd(), "apps/bot/personas.json");
    const finalPath = configPath || defaultPath;
    
    try {
      const raw = fs.readFileSync(finalPath, "utf-8");
      this.config = JSON.parse(raw);
    } catch (error) {
      console.warn(`Failed to load personas from ${finalPath}, using defaults.`, error);
      this.config = {
        default: "narrator",
        personas: {
          narrator: { provider: "deepgram", voiceId: "aura-asteria-en" }
        }
      };
    }
  }

  getDefaultPersonaName(): string {
    return this.config.default;
  }

  resolvePersona(name: string): { provider: string; voiceConfig: TtsVoiceConfig } {
    const persona = this.config.personas[name.toLowerCase()] || this.config.personas[this.config.default];
    
    if (!persona) {
        // Fallback if even default is missing
        return {
            provider: "deepgram",
            voiceConfig: { voice: "aura-asteria-en" }
        };
    }

    return {
      provider: persona.provider,
      voiceConfig: {
        voice: persona.voiceId,
        options: persona.options,
      },
    };
  }
  
  getPersonas(): string[] {
      return Object.keys(this.config.personas);
  }
}
