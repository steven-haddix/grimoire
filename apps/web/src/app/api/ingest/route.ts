import { NextResponse } from "next/server";
import { db } from "@/db";
import { transcripts } from "@/db/schema";

type IngestPayload = {
  sessionId: number;
  speaker: string;
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

  await db.insert(transcripts).values({
    sessionId: payload.sessionId,
    speaker: payload.speaker,
    content: payload.text,
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
  });

  return NextResponse.json({ ok: true });
}
