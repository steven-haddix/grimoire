import { generateText } from "ai";
import { asc, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, sessions, summaries, transcripts } from "@/db/schema";
import {
  claudeModel,
  claudeProviderOptions,
  resolveClaudeEffort,
} from "@/lib/agents/claude";
import { runExtraction } from "@/lib/extraction/run";
import { indexSession } from "@/lib/search/indexer";

// Session recaps aren't latency-sensitive (fired in the background when a
// session ends), so default to deep reasoning; override per env.
const SUMMARY_EFFORT = resolveClaudeEffort(process.env.SUMMARY_EFFORT, "high");

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

  const [session] = await db
    .select({
      id: sessions.id,
      campaignId: sessions.campaignId,
      status: sessions.status,
      endedAt: sessions.endedAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const existingSummary = await db.query.summaries.findFirst({
    where: eq(summaries.sessionId, sessionId),
    columns: { text: true },
  });
  if (existingSummary) {
    if (session.status !== "completed") {
      await db
        .update(sessions)
        .set({ status: "completed", endedAt: session.endedAt ?? new Date() })
        .where(eq(sessions.id, sessionId));
    }
    // A replay can mean the first attempt died before its post-response work
    // ran; both calls are no-ops when the session is already indexed and
    // extracted.
    after(async () => {
      await indexSession(sessionId);
      await runExtraction(sessionId);
    });
    return NextResponse.json({
      success: true,
      summary: existingSummary.text,
      existing: true,
    });
  }

  if (session.status === "active") {
    return NextResponse.json(
      { error: "Stop the session before summarizing" },
      { status: 409 },
    );
  }

  const campaign = session.campaignId
    ? await db
        .select({
          name: campaigns.name,
          description: campaigns.description,
        })
        .from(campaigns)
        .where(eq(campaigns.id, session.campaignId))
        .then((rows) => rows[0] ?? null)
    : null;

  const lines = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.sessionId, sessionId))
    .orderBy(asc(transcripts.timestamp));

  if (!lines.length) {
    await db
      .update(sessions)
      .set({
        status: "completed_empty",
        endedAt: session.endedAt ?? new Date(),
      })
      .where(eq(sessions.id, sessionId));
    return NextResponse.json({ success: true, summary: "", empty: true });
  }

  await db
    .update(sessions)
    .set({ status: "summarizing" })
    .where(eq(sessions.id, sessionId));

  const script = lines
    .map(
      (line: typeof transcripts.$inferSelect) =>
        `${line.speaker}: ${line.content}`,
    )
    .join("\n");

  const campaignContext = campaign
    ? `\n\nCAMPAIGN CONTEXT:\nCampaign Name: ${campaign.name}${campaign.description ? `\nCampaign Description: ${campaign.description}` : ""}\n\nUse this campaign context to better understand the setting, characters, and ongoing storylines when summarizing the session.`
    : "";

  const { text } = await generateText({
    model: claudeModel,
    instructions:
      "You are a D&D scribe. Summarize the session with sections for Plot, Combat, and Loot.",
    prompt: `${campaignContext ? `${campaignContext}\n\n` : ""}TRANSCRIPT:\n${script}`,
    runtimeContext: {
      sessionId,
      campaignId: session.campaignId ?? null,
      campaignName: campaign?.name ?? null,
    },
    telemetry: {
      isEnabled: true,
      functionId: "summarize-session",
      includeRuntimeContext: {
        sessionId: true,
        campaignId: true,
        campaignName: true,
      },
    },
    providerOptions: claudeProviderOptions(SUMMARY_EFFORT),
  });

  await db
    .insert(summaries)
    .values({ sessionId, text })
    .onConflictDoNothing({ target: summaries.sessionId });
  await db
    .update(sessions)
    .set({ status: "completed", endedAt: session.endedAt ?? new Date() })
    .where(eq(sessions.id, sessionId));

  // Index this session's summary + transcripts for long-term campaign search,
  // then extract entities into the campaign graph. Runs after the response
  // flushes (via `after`) so neither adds latency to the summarize request.
  // Sequential: extraction reads the summary/transcripts it also feeds on, and
  // both are best-effort — neither ever throws.
  after(async () => {
    await indexSession(sessionId);
    await runExtraction(sessionId);
  });

  return NextResponse.json({ success: true, summary: text });
}
