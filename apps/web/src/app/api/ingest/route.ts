import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, transcripts } from "@/db/schema";
import { maybeIndexSession } from "@/lib/search/indexer";

// The bot's auto-stop fires exactly at autoStopAt and then flushes the last
// Deepgram finals, whose ingest POSTs arrive after the deadline; without a
// grace window the session's closing utterances would be rejected.
const AUTO_STOP_INGEST_GRACE_MS = 5 * 60_000;

type IngestPayload = {
  sessionId: number;
  speaker: string;
  speakerUserId?: string;
  text: string;
  timestamp?: string | number;
};

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

function parseIngestPayload(value: unknown): IngestPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const sessionId = parseSessionId(value.sessionId);
  if (sessionId === null) {
    return null;
  }

  if (typeof value.speaker !== "string" || value.speaker.trim() === "") {
    return null;
  }

  if (typeof value.text !== "string" || value.text.trim() === "") {
    return null;
  }

  const payload: IngestPayload = {
    sessionId,
    speaker: value.speaker,
    text: value.text,
  };

  // Optional: older bot deployments don't send it.
  if (
    typeof value.speakerUserId === "string" &&
    value.speakerUserId.trim() !== ""
  ) {
    payload.speakerUserId = value.speakerUserId.trim();
  }

  if (
    typeof value.timestamp === "string" ||
    typeof value.timestamp === "number"
  ) {
    payload.timestamp = value.timestamp;
  }

  return payload;
}

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = parseIngestPayload(await req.json().catch(() => null));

  if (!payload) {
    return NextResponse.json(
      { error: "Missing sessionId, speaker, or text" },
      { status: 400 },
    );
  }

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, payload.sessionId),
    columns: { status: true, autoStopAt: true },
  });
  if (
    !session ||
    session.status !== "active" ||
    (session.autoStopAt &&
      session.autoStopAt.getTime() + AUTO_STOP_INGEST_GRACE_MS <= Date.now())
  ) {
    return NextResponse.json(
      { error: "Session is not active" },
      { status: 409 },
    );
  }

  await db.insert(transcripts).values({
    sessionId: payload.sessionId,
    speaker: payload.speaker,
    speakerDiscordUserId: payload.speakerUserId ?? null,
    content: payload.text,
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
  });

  // Keep the live session searchable: debounced, best-effort, and runs after
  // the response flushes so ingest latency is unaffected.
  after(() => maybeIndexSession(payload.sessionId));

  return NextResponse.json({ ok: true });
}
