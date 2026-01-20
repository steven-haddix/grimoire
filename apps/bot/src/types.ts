import type { TtsVoiceConfig } from "./tts/types";

export type ReplyFn = (content: string) => Promise<void>;

export type CommandContext = {
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
  voiceChannelId?: string;
  reply: ReplyFn;
};

export type CommandIntent =
  | { type: "help" }
  | { type: "start" }
  | { type: "stop" }
  | { type: "recap" }
  | { type: "say"; text: string; voiceOverride?: string }
  | { type: "agent"; message: string }
  | { type: "campaign_create"; name: string; description?: string }
  | { type: "campaign_list" }
  | { type: "campaign_select"; name: string };

export type TranscriptInput = {
  sessionId: number;
  speaker: string;
  text: string;
  timestamp: string;
};

export type TranscriptSink = {
  ingest: (input: TranscriptInput) => Promise<void>;
};

export type SpeakerResolver = (userId: string) => string | undefined;

export type VoiceGateway = {
  startListening: (params: {
    guildId: string;
    channelId: string;
  }) => Promise<void>;
  stopListening: (guildId: string) => void;
  speak: (params: {
    guildId: string;
    voiceChannelId: string;
    text: string;
    voice: TtsVoiceConfig;
    shouldDisconnect: boolean;
  }) => Promise<void>;
  isConnected: (guildId: string) => boolean;
};
