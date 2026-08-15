import type { TtsVoiceConfig } from "./tts/types";

export type ReplyFn = (content: string) => Promise<void>;

export type CommandContext = {
  guildId: string;
  channelId: string;
  userId: string;
  userName: string;
  userDisplayName: string;
  canManageGuild: boolean;
  voiceChannelId?: string;
  reply: ReplyFn;
  replyWithImage: (image: {
    buffer: Buffer;
    filename: string;
    caption?: string;
  }) => Promise<void>;
};

export type CommandIntent =
  | { type: "help" }
  | { type: "start" }
  | { type: "stop"; reason?: "manual_command" | "stop_button" }
  | { type: "recap" }
  | { type: "say"; text: string; voiceOverride?: string }
  | { type: "agent"; message: string }
  | { type: "scene"; prompt: string }
  | { type: "campaign_create"; name: string; description?: string }
  | { type: "campaign_list" }
  | { type: "campaign_select"; name: string }
  | {
      type: "schedule_set";
      weekday: number;
      localTime: string;
      timeZone: string;
    }
  | { type: "schedule_show" }
  | { type: "schedule_remove" };

export type TranscriptInput = {
  sessionId: number;
  speaker: string;
  // Discord user ID of the speaker. Display names drift; this is the stable
  // identity key used for player/PC linking on the web side.
  speakerUserId: string;
  text: string;
  timestamp: string;
};

export type TranscriptSink = {
  ingest: (input: TranscriptInput) => Promise<void>;
};

export type SpeakerResolver = (
  userId: string,
  guildId: string,
) => string | undefined;

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
