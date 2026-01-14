import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { db } from "@/db";
import { sessions, summaries, transcripts } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const sessionId = Number(payload?.sessionId);

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const lines = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .orderBy(asc(transcripts.timestamp));

  if (!lines.length) {
    return NextResponse.json({ error: "Empty session" }, { status: 400 });
  }

  const script = lines.map((line) => `${line.speaker}: ${line.content}`).join("\n");

  const { text } = await generateText({
    model: openai("gpt-4o"),
    system:
      "You are a D&D scribe. Summarize the session with sections for Plot, Combat, and Loot.",
    prompt: `TRANSCRIPT:\n${script}`
  });

  await db.insert(summaries).values({ sessionId, text });
  await db
    .update(sessions)
    .set({ status: "completed", endedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return NextResponse.json({ success: true, summary: text });
}
