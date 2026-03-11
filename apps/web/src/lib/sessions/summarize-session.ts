import { type GoogleGenerativeAIProviderOptions, google } from "@ai-sdk/google";
import { generateText } from "ai";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  campaigns,
  sessionNotes,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";

export class SessionSummaryError extends Error {
  code: "empty_session" | "session_not_found";

  constructor(code: "empty_session" | "session_not_found", message: string) {
    super(message);
    this.code = code;
  }
}

function buildCampaignContext(
  campaign: {
    name: string;
    description: string | null;
  } | null,
) {
  if (!campaign) {
    return "";
  }

  return `CAMPAIGN CONTEXT:
Campaign Name: ${campaign.name}${campaign.description ? `\nCampaign Description: ${campaign.description}` : ""}

Use this campaign context to better understand the setting, characters, and ongoing storylines when summarizing the session.`;
}

export async function generateSessionSummary(sessionId: number) {
  const [session] = await db
    .select({
      id: sessions.id,
      campaignId: sessions.campaignId,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new SessionSummaryError("session_not_found", "Session not found");
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

  const [lines, notes] = await Promise.all([
    db
      .select({
        speaker: transcripts.speaker,
        content: transcripts.content,
        timestamp: transcripts.timestamp,
      })
      .from(transcripts)
      .where(eq(transcripts.sessionId, sessionId))
      .orderBy(asc(transcripts.timestamp)),
    db
      .select({
        content: sessionNotes.content,
        source: sessionNotes.source,
        createdByName: sessionNotes.createdByName,
        createdAt: sessionNotes.createdAt,
      })
      .from(sessionNotes)
      .where(eq(sessionNotes.sessionId, sessionId))
      .orderBy(asc(sessionNotes.createdAt)),
  ]);

  if (!lines.length && !notes.length) {
    throw new SessionSummaryError("empty_session", "Empty session");
  }

  const transcriptBlock = lines.length
    ? lines.map((line) => `${line.speaker}: ${line.content}`).join("\n")
    : "No transcript was recorded for this session.";

  const notesBlock = notes.length
    ? notes
        .map(
          (note) =>
            `[${note.source}] ${note.createdByName}: ${note.content.trim()}`,
        )
        .join("\n\n")
    : "No additional session notes were provided.";

  const campaignContext = buildCampaignContext(campaign);

  const { text } = await generateText({
    model: google("gemini-3-flash-preview"),
    system:
      "You are a D&D scribe. Create a clear recap with sections for Plot, Combat, Loot, and Table Notes. Use transcript lines as the strongest evidence, but incorporate supplemental notes when they add context or cover unrecorded parts. If a section has no evidence, say 'None recorded.' Do not invent facts.",
    prompt: `${campaignContext ? `${campaignContext}\n\n` : ""}SESSION MATERIAL:

TRANSCRIPT:
${transcriptBlock}

SUPPLEMENTAL NOTES:
${notesBlock}`,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "summarize-session",
      metadata: {
        sessionId,
        transcriptCount: lines.length,
        noteCount: notes.length,
        ...(session.campaignId && { campaignId: session.campaignId }),
        ...(campaign?.name && { campaignName: campaign.name }),
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

  return {
    text,
    transcriptCount: lines.length,
    noteCount: notes.length,
  };
}
