import { describe, expect, test } from "bun:test";
import type { RuntimeDb } from "@grimoire/data/client";
import type { SessionContext } from "@grimoire/data/repos/sessions";
import { createSessionLifecycle } from "./session-lifecycle";

const noopDb = {} as RuntimeDb;

describe("createSessionLifecycle", () => {
  test("start delegates to startSession repo", async () => {
    const lifecycle = createSessionLifecycle({
      db: noopDb,
      summarizer: {
        summarize: async () => "",
      },
      startSessionFn: async (_db, input) => {
        expect(input.guildId).toBe("guild-1");
        expect(input.channelId).toBe("voice-1");
        return 55;
      },
    });

    const sessionId = await lifecycle.start({
      guildId: "guild-1",
      channelId: "voice-1",
    });

    expect(sessionId).toBe(55);
  });

  test("stop summarizes and marks session complete", async () => {
    const completeCalls: Array<{ sessionId: number; summaryText?: string }> =
      [];

    const context: SessionContext = {
      sessionId: 10,
      guildId: "guild-1",
      campaign: { name: "A", description: null },
      transcript: [
        {
          speaker: "DM",
          content: "Welcome",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const lifecycle = createSessionLifecycle({
      db: noopDb,
      summarizer: {
        summarize: async () => "Line one\nLine two",
      },
      getSessionContextFn: async () => context,
      completeSessionFn: async (_db, input) => {
        completeCalls.push(input);
        return {
          sessionId: input.sessionId,
          status: input.summaryText ? "completed" : "completed_no_summary",
          summary: input.summaryText ?? null,
        };
      },
    });

    const result = await lifecycle.stop(10);

    expect(completeCalls).toEqual([
      {
        sessionId: 10,
        summaryText: "Line one\nLine two",
      },
    ]);
    expect(result.recap).toBe("Line one\nLine two");
    expect(result.status).toBe("completed");
  });

  test("stop handles summarizer failure by completing without summary", async () => {
    const completeCalls: Array<{ sessionId: number; summaryText?: string }> =
      [];

    const context: SessionContext = {
      sessionId: 20,
      guildId: "guild-1",
      campaign: null,
      transcript: [
        {
          speaker: "DM",
          content: "Hello",
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const lifecycle = createSessionLifecycle({
      db: noopDb,
      summarizer: {
        summarize: async () => {
          throw new Error("boom");
        },
      },
      getSessionContextFn: async () => context,
      completeSessionFn: async (_db, input) => {
        completeCalls.push(input);
        return {
          sessionId: input.sessionId,
          status: input.summaryText ? "completed" : "completed_no_summary",
          summary: input.summaryText ?? null,
        };
      },
    });

    const result = await lifecycle.stop(20);

    expect(completeCalls).toEqual([
      {
        sessionId: 20,
      },
    ]);
    expect(result.summary).toBeNull();
    expect(result.status).toBe("completed_no_summary");
  });
});
