export type BotConfig = {
  discordToken: string;
  discordAppId?: string;
  apiBase: string;
  botSecret: string;
  botHttpPort: number;
  ttsVoice: string;
  ttsVoiceOptions?: Record<string, unknown>;
};

function parseVoiceOptions(raw?: string): Record<string, unknown> | undefined {
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

export function loadConfig(env: Record<string, string | undefined>): BotConfig {
  const discordToken = env.DISCORD_TOKEN;
  const nextApiUrl = env.NEXT_API_URL;
  const botSecret = env.BOT_SECRET;

  const missing: string[] = [];
  if (!discordToken) missing.push("DISCORD_TOKEN");
  if (!nextApiUrl) missing.push("NEXT_API_URL");
  if (!botSecret) missing.push("BOT_SECRET");

  if (missing.length || !discordToken || !nextApiUrl || !botSecret) {
    throw new Error(`Missing ${missing.join(", ")}`);
  }

  const apiBase = nextApiUrl.replace(/\/$/, "");
  const botServerPortRaw = env.BOT_HTTP_PORT ?? env.PORT ?? "3001";
  const botHttpPort = Number.parseInt(botServerPortRaw, 10);

  if (Number.isNaN(botHttpPort)) {
    throw new Error("Invalid BOT_HTTP_PORT/PORT value");
  }

  const ttsVoice = env.TTS_VOICE ?? "narrator";
  const ttsVoiceOptions = parseVoiceOptions(env.TTS_VOICE_OPTIONS);

  const discordAppId =
    env.DISCORD_APP_ID ?? env.DISCORD_APPLICATION_ID ?? env.DISCORD_CLIENT_ID;

  return {
    discordToken,
    discordAppId,
    apiBase,
    botSecret,
    botHttpPort,
    ttsVoice,
    ttsVoiceOptions,
  };
}
