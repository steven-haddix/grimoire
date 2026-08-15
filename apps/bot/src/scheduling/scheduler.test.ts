import { describe, expect, mock, test } from "bun:test";
import type { BotApi, ScheduledJob } from "../api/bot-api";
import type { BotController } from "../services/bot-controller";
import { processScheduledJob, shouldDeliverStartReminder } from "./scheduler";

function job(
  type: string,
  payload: Record<string, unknown>,
  runAt = "2026-08-13T00:30:00.000Z",
): ScheduledJob {
  return {
    id: 12,
    type,
    scheduleId: null,
    sessionId: typeof payload.sessionId === "number" ? payload.sessionId : null,
    runAt,
    payload,
    attemptCount: 1,
  };
}

function harness(status = "active") {
  const send = mock(async (_payload: unknown) => ({}));
  const summarizeSession = mock(async (_sessionId: number) => {});
  const getSessionState = mock(async (sessionId: number) => ({
    session: {
      id: sessionId,
      guildId: "guild-1",
      textChannelId: "text-1",
      status,
      autoStopAt: "2026-08-13T01:30:00.000Z",
    },
  }));
  const stopSessionById = mock(async (_input: unknown) => {});

  return {
    send,
    summarizeSession,
    getSessionState,
    stopSessionById,
    client: {
      channels: {
        fetch: mock(async () => ({ isSendable: () => true, send })),
      },
    } as never,
    api: {
      getSessionState,
      summarizeSession,
    } as unknown as BotApi,
    controller: { stopSessionById } as unknown as BotController,
  };
}

describe("start reminder timing", () => {
  const occurrence = new Date("2026-08-13T00:30:00.000Z");

  test("is false before due, true at due, and inclusive through one hour", () => {
    expect(
      shouldDeliverStartReminder(
        occurrence,
        new Date("2026-08-13T00:29:59.999Z"),
      ),
    ).toBe(false);
    expect(shouldDeliverStartReminder(occurrence, occurrence)).toBe(true);
    expect(
      shouldDeliverStartReminder(
        occurrence,
        new Date("2026-08-13T01:30:00.000Z"),
      ),
    ).toBe(true);
    expect(
      shouldDeliverStartReminder(
        occurrence,
        new Date("2026-08-13T01:30:00.001Z"),
      ),
    ).toBe(false);
  });

  test("sends a start button for a due reminder", async () => {
    const h = harness();
    await processScheduledJob({
      ...h,
      job: job("game_start_reminder", {
        guildId: "guild-1",
        channelId: "text-1",
        campaignName: "Curse of Strahd",
        occurrenceAt: occurrence.toISOString(),
      }),
      now: occurrence,
    });
    expect(h.send).toHaveBeenCalledTimes(1);
    const payload = h.send.mock.calls[0]?.[0] as {
      content: string;
      components: Array<{ toJSON: () => unknown }>;
    };
    expect(payload.content).toContain("Curse of Strahd");
    expect(payload.components[0]?.toJSON()).toEqual(
      expect.objectContaining({
        components: [expect.objectContaining({ custom_id: "grim:start:12" })],
      }),
    );
  });

  test("silently skips a stale reminder", async () => {
    const h = harness();
    await processScheduledJob({
      ...h,
      job: job("game_start_reminder", {
        guildId: "guild-1",
        channelId: "text-1",
        occurrenceAt: occurrence.toISOString(),
      }),
      now: new Date("2026-08-13T01:30:00.001Z"),
    });
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("session deadline jobs", () => {
  const payload = {
    guildId: "guild-1",
    channelId: "text-1",
    sessionId: 42,
  };

  test("sends a stop button only while the session is active", async () => {
    const active = harness("active");
    await processScheduledJob({
      ...active,
      job: job("session_stop_reminder", payload),
    });
    expect(active.send).toHaveBeenCalledTimes(1);
    const sent = active.send.mock.calls[0]?.[0] as {
      components: Array<{ toJSON: () => unknown }>;
    };
    expect(sent.components[0]?.toJSON()).toEqual(
      expect.objectContaining({
        components: [expect.objectContaining({ custom_id: "grim:stop:42" })],
      }),
    );

    const ended = harness("completed");
    await processScheduledJob({
      ...ended,
      job: job("session_stop_reminder", payload),
    });
    expect(ended.send).not.toHaveBeenCalled();
  });

  test("auto-stops an active session but never a completed one", async () => {
    const active = harness("active");
    await processScheduledJob({
      ...active,
      job: job("session_auto_stop", payload),
    });
    expect(active.stopSessionById).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: "guild-1",
        sessionId: 42,
        reason: "max_duration",
      }),
    );

    const ended = harness("completed");
    await processScheduledJob({
      ...ended,
      job: job("session_auto_stop", payload),
    });
    expect(ended.stopSessionById).not.toHaveBeenCalled();
  });

  test("refuses a deadline job whose guild does not own the session", async () => {
    const h = harness("active");
    expect(
      processScheduledJob({
        ...h,
        job: job("session_auto_stop", {
          ...payload,
          guildId: "different-guild",
        }),
      }),
    ).rejects.toThrow("guild does not match");
    expect(h.stopSessionById).not.toHaveBeenCalled();
  });

  test("runs summary work with the persisted session id", async () => {
    const h = harness();
    await processScheduledJob({
      ...h,
      job: job("summarize_session", { sessionId: 42 }),
    });
    expect(h.summarizeSession).toHaveBeenCalledWith(42);
  });

  test("rejects malformed and unknown jobs", async () => {
    const h = harness();
    expect(
      processScheduledJob({
        ...h,
        job: job("session_auto_stop", {
          guildId: "guild-1",
          channelId: "text-1",
        }),
      }),
    ).rejects.toThrow("sessionId");
    expect(
      processScheduledJob({
        ...h,
        job: job("dragon_attack", {
          guildId: "guild-1",
          channelId: "text-1",
        }),
      }),
    ).rejects.toThrow("Unknown scheduled job type");
  });
});
