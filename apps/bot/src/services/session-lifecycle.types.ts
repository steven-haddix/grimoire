export type SessionLifecycle = {
  start: (input: { guildId: string; channelId: string }) => Promise<number>;
  stop: (sessionId: number) => Promise<{
    summary: string | null;
    recap: string | null;
    status: string;
  }>;
};
