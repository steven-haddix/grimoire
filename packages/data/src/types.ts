export const MEMORY_CATEGORIES = [
  "lore",
  "character",
  "rule",
  "meta",
  "other",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type CampaignContext = {
  activeCampaignId: number | null;
  campaign: {
    id: number;
    name: string;
    description: string | null;
  } | null;
  sessions: Array<{
    id: number;
    sessionNumber: number;
    status: string;
    startedAt: string | null;
    endedAt: string | null;
    summary: string | null;
  }>;
  recentTranscripts: Array<{
    speaker: string;
    content: string;
    timestamp: string | null;
  }>;
  memories: Array<{
    id: number;
    content: string;
    category: string;
    source: string | null;
    createdAt: string | null;
  }>;
  recentChatMessages: Array<{
    displayName: string;
    content: string;
    isBot: boolean;
    createdAt: string | null;
  }>;
};

export type GuildPresence = {
  guildId: string;
  name: string;
  icon: string | null;
};
