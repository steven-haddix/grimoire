export type BotConfig = {
  discordToken: string;
  apiBase: string;
  botSecret: string;
  botHttpPort: number;
  ttsVoice: string;
  ttsVoiceOptions?: Record<string, unknown>;
};

function parseVoiceOptions(
  raw?: string,
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.warn("Invalid TTS_VOICE_OPTIONS JSON", error);
  }
  return undefined;
}

export function loadConfig(
  env: Record<string, string | undefined>,
): BotConfig {
  const missing: string[] = [];
  if (!env.DISCORD_TOKEN) missing.push("DISCORD_TOKEN");
  if (!env.NEXT_API_URL) missing.push("NEXT_API_URL");
  if (!env.BOT_SECRET) missing.push("BOT_SECRET");

  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }

  const apiBase = env.NEXT_API_URL.replace(/\/$/, "");
  const botServerPortRaw = env.BOT_HTTP_PORT ?? env.PORT ?? "3001";
  const botHttpPort = Number.parseInt(botServerPortRaw, 10);

  if (Number.isNaN(botHttpPort)) {
    throw new Error("Invalid BOT_HTTP_PORT/PORT value");
  }

  const ttsVoice = env.TTS_VOICE ?? "aura-asteria-en";
  const ttsVoiceOptions = parseVoiceOptions(env.TTS_VOICE_OPTIONS);

  return {
    discordToken: env.DISCORD_TOKEN,
    apiBase,
    botSecret: env.BOT_SECRET,
    botHttpPort,
    ttsVoice,
    ttsVoiceOptions,
  };
}
