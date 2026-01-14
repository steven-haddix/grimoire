import { db } from "@/db";
import { transcripts } from "@/db/schema";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);

  if (!payload?.sessionId || !payload?.speaker || !payload?.text) {
    return NextResponse.json({ error: "Missing sessionId, speaker, or text" }, { status: 400 });
  }

  await db.insert(transcripts).values({
    sessionId: Number(payload.sessionId),
    speaker: payload.speaker,
    content: payload.text,
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date()
  });

  return NextResponse.json({ ok: true });
}
