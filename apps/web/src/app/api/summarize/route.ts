import { type GoogleGenerativeAIProviderOptions, google } from "@ai-sdk/google";
import { generateText } from "ai";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, summaries, transcripts } from "@/db/schema";

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

  const lines = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .orderBy(asc(transcripts.timestamp));

  if (!lines.length) {
    return NextResponse.json({ error: "Empty session" }, { status: 400 });
  }

  const script = lines
    .map(
      (line: typeof transcripts.$inferSelect) =>
        `${line.speaker}: ${line.content}`,
    )
    .join("\n");

  const { text } = await generateText({
    model: google("gemini-3-flash-preview"),
    system:
      "You are a D&D scribe. Summarize the session with sections for Plot, Combat, and Loot.",
    prompt: `TRANSCRIPT:\n${script}`,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "summarize-session",
      metadata: {
        sessionId,
      },
    },
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: "high",
          includeThoughts: true,
        },
      } satisfies GoogleGenerativeAIProviderOptions,
    },
  });

  await db.insert(summaries).values({ sessionId, text });
  await db
    .update(sessions)
    .set({ status: "completed", endedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  return NextResponse.json({ success: true, summary: text });
}
