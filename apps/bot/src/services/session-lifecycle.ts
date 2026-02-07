import type { RuntimeDb } from "@grimoire/data/client";
import {
  completeSession,
  getSessionContext,
  type SessionContext,
  startSession,
} from "@grimoire/data/repos/sessions";
import type { SessionLifecycle } from "./session-lifecycle.types";

type SessionSummarizer = {
  summarize: (context: SessionContext) => Promise<string>;
};

function asShortRecap(summary: string) {
  const lines = summary
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 6);

  return lines.join("\n");
}

export function createSessionLifecycle(params: {
  db: RuntimeDb;
  summarizer: SessionSummarizer;
  startSessionFn?: typeof startSession;
  getSessionContextFn?: typeof getSessionContext;
  completeSessionFn?: typeof completeSession;
}): SessionLifecycle {
  const {
    db,
    summarizer,
    startSessionFn = startSession,
    getSessionContextFn = getSessionContext,
    completeSessionFn = completeSession,
  } = params;

  const start = async (input: { guildId: string; channelId: string }) => {
    return startSessionFn(db, input);
  };

  const stop = async (sessionId: number) => {
    const context = await getSessionContextFn(db, sessionId);

    if (!context) {
      throw new Error("Session not found");
    }

    if (context.transcript.length === 0) {
      const completed = await completeSessionFn(db, {
        sessionId,
      });

      return {
        summary: null,
        recap: null,
        status: completed.status,
      };
    }

    try {
      const summary = await summarizer.summarize(context);
      const completed = await completeSessionFn(db, {
        sessionId,
        summaryText: summary,
      });

      return {
        summary,
        recap: asShortRecap(summary),
        status: completed.status,
      };
    } catch (error) {
      console.error("Session summary generation failed", error);
      const completed = await completeSessionFn(db, {
        sessionId,
      });

      return {
        summary: null,
        recap: null,
        status: completed.status,
      };
    }
  };

  return {
    start,
    stop,
  };
}
