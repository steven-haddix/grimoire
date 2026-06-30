import { mock } from "bun:test";

// @discordjs/voice ships a dual CJS/ESM build. Bun intermittently fails to
// resolve named exports from its `.mjs` build under concurrent test loading
// ("Export named '...' not found in module ...index.mjs"), and an *incomplete*
// module mock makes bun fall back to that real `.mjs` for any missing export.
//
// To keep the process-global module mock consistent, every bot test that
// (transitively) imports "@discordjs/voice" installs this single COMPLETE stub
// via `installDiscordVoiceMock`, so the real module is never evaluated no matter
// which test file registers the mock first.

export const VoiceConnectionStatus = {
  Connecting: "connecting",
  Destroyed: "destroyed",
  Disconnected: "disconnected",
  Ready: "ready",
  Signalling: "signalling",
} as const;

export const EndBehaviorType = {
  Manual: 0,
  AfterSilence: 1,
  AfterInactivity: 2,
} as const;

export const AudioPlayerStatus = {
  AutoPaused: "autopaused",
  Buffering: "buffering",
  Idle: "idle",
  Paused: "paused",
  Playing: "playing",
} as const;

export const StreamType = {
  Arbitrary: "arbitrary",
  OggOpus: "ogg/opus",
  Opus: "opus",
  Raw: "raw",
  WebmOpus: "webm/opus",
} as const;

export const NoSubscriberBehavior = {
  Pause: "pause",
  Play: "play",
  Stop: "stop",
} as const;

/**
 * Register a complete stub for "@discordjs/voice". Pass `overrides` to supply
 * spies/fakes for specific exports (e.g. createAudioPlayer) while keeping the
 * rest of the module faithfully stubbed.
 */
export function installDiscordVoiceMock(
  overrides: Record<string, unknown> = {},
): void {
  mock.module("@discordjs/voice", () => ({
    VoiceConnectionStatus,
    EndBehaviorType,
    AudioPlayerStatus,
    StreamType,
    NoSubscriberBehavior,
    entersState: mock(async (connection: unknown) => connection),
    getVoiceConnection: mock(() => undefined),
    joinVoiceChannel: mock(() => undefined),
    createAudioPlayer: mock(() => ({})),
    createAudioResource: mock((stream: unknown, options: unknown) => ({
      stream,
      options,
    })),
    ...overrides,
  }));
}
