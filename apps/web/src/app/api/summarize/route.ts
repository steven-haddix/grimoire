import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import {
  generateSessionSummary,
  SessionSummaryError,
} from "@/lib/sessions/summarize-session";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSessionId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const sessionId = isRecord(payload)
    ? parseSessionId(payload.sessionId)
    : null;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  try {
    const { text } = await generateSessionSummary(sessionId);

    await db
      .update(sessions)
      .set({ status: "completed", endedAt: new Date() })
      .where(eq(sessions.id, sessionId));

    return NextResponse.json({ success: true, summary: text });
  } catch (error) {
    if (error instanceof SessionSummaryError) {
      const status =
        error.code === "session_not_found"
          ? 404
          : error.code === "empty_session"
            ? 400
            : 500;

      return NextResponse.json({ error: error.message }, { status });
    }

    throw error;
  }
}
