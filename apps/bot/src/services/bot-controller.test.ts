import { describe, expect, mock, test } from "bun:test";
import type { BotApi } from "../api/bot-api";
import type { BotConfig } from "../config";
import type { CommandContext, VoiceGateway } from "../types";
import { createBotController } from "./bot-controller";
import type { TranscriptionService } from "./transcription-service";

function createHarness(autoStopAt: Date) {
  const sessions = new Map<string, number>();
  const replies: string[] = [];
  const startListening = mock(async () => {});
  const stopListening = mock(() => {});
  const stopSession = mock(async () => ({ stopped: true, status: "ended" }));
  const isStartReminderValid = mock(async () => true);
  const sendChannelMessage = mock(
    async (_channelId: string, content: string) => {
      replies.push(content);
    },
  );

  const controller = createBotController({
    config: {
      discordToken: "test",
      apiBase: "http://example.test/api",
      botSecret: "test",
      botHttpPort: 3001,
      ttsVoice: "narrator",
    } satisfies BotConfig,
    api: {
      startSession: mock(async () => ({
        sessionId: 42,
        resumed: false,
        stopReminderAt: new Date(
          autoStopAt.getTime() - 60 * 60_000,
        ).toISOString(),
        autoStopAt: autoStopAt.toISOString(),
      })),
      stopSession,
      isStartReminderValid,
    } as unknown as BotApi,
    voice: {
      isConnected: () => false,
      startListening,
      stopListening,
    } as unknown as VoiceGateway,
    transcription: {
      setSessionId: (guildId: string, sessionId: number) =>
        sessions.set(guildId, sessionId),
      getSessionId: (guildId: string) => sessions.get(guildId),
      clearSession: async (guildId: string) => {
        sessions.delete(guildId);
      },
      hasSession: (guildId: string) => sessions.has(guildId),
    } as unknown as TranscriptionService,
    sendChannelMessage,
  });

  const ctx: CommandContext = {
    guildId: "guild-1",
    channelId: "text-1",
    userId: "user-1",
    userName: "dm",
    userDisplayName: "DM",
    canManageGuild: true,
    voiceChannelId: "voice-1",
    reply: async (content) => {
      replies.push(content);
    },
    replyWithImage: async () => {},
  };

  return {
    controller,
    ctx,
    replies,
    startListening,
    stopListening,
    stopSession,
    sendChannelMessage,
    isStartReminderValid,
  };
}

describe("BotController session deadlines", () => {
  test("a past deadline stops immediately after a resumed/start response", async () => {
    const h = createHarness(new Date(Date.now() - 1));
    await h.controller.handleIntent({ type: "start" }, h.ctx);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(h.startListening).toHaveBeenCalledTimes(1);
    expect(h.stopListening).toHaveBeenCalledWith("guild-1");
    expect(h.stopSession).toHaveBeenCalledWith({
      sessionId: 42,
      reason: "max_duration",
    });
    expect(h.sendChannelMessage).toHaveBeenCalledWith(
      "text-1",
      expect.stringContaining("four-hour safety limit"),
    );
  });

  test("rejects an expired start button without joining voice", async () => {
    const h = createHarness(new Date(Date.now() + 1_000));
    h.isStartReminderValid.mockResolvedValue(false);
    await h.controller.handleStartReminder(12, h.ctx);

    expect(h.isStartReminderValid).toHaveBeenCalledWith(12, "guild-1");
    expect(h.startListening).not.toHaveBeenCalled();
    expect(h.replies.at(-1)).toContain("expired");
  });

  test("manual stop cancels the local deadline timer", async () => {
    const h = createHarness(new Date(Date.now() + 50));
    await h.controller.handleIntent({ type: "start" }, h.ctx);
    await h.controller.handleIntent({ type: "stop" }, h.ctx);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(h.stopSession).toHaveBeenCalledTimes(1);
    expect(h.stopSession).toHaveBeenCalledWith({
      sessionId: 42,
      reason: "manual_command",
    });
    expect(h.sendChannelMessage).not.toHaveBeenCalled();
  });
});
