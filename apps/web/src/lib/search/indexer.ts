import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  type SearchableChunkSource,
  searchableChunks,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import { embedText, embedTexts } from "./embeddings";

// Roughly how many characters of transcript go into one embeddable chunk.
// Small enough to stay semantically focused, large enough to keep context.
const TRANSCRIPT_CHUNK_CHAR_LIMIT = 1500;

type TranscriptLine = { speaker: string; content: string };

export type TranscriptChunk = { content: string; speaker: string | null };

/**
 * Group consecutive transcript lines into larger, embeddable chunks. Each line
 * is rendered as `Speaker: text`; a chunk's `speaker` is set only when every
 * line in it shares one speaker (otherwise null for mixed dialogue).
 */
export function chunkTranscriptLines(
  lines: TranscriptLine[],
  charLimit: number = TRANSCRIPT_CHUNK_CHAR_LIMIT,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let current: string[] = [];
  let currentLen = 0;
  const speakers = new Set<string>();

  const flush = () => {
    if (!current.length) return;
    chunks.push({
      content: current.join("\n"),
      speaker: speakers.size === 1 ? ([...speakers][0] ?? null) : null,
    });
    current = [];
    currentLen = 0;
    speakers.clear();
  };

  for (const line of lines) {
    const text = line.content.trim();
    if (!text) continue;
    const formatted = `${line.speaker}: ${text}`;
    if (current.length && currentLen + formatted.length > charLimit) {
      flush();
    }
    speakers.add(line.speaker);
    current.push(formatted);
    currentLen += formatted.length + 1;
  }
  flush();

  return chunks;
}

type PendingChunk = {
  sourceType: SearchableChunkSource;
  sourceId: number | null;
  chunkIndex: number;
  speaker: string | null;
  content: string;
};

/**
 * (Re)build the search index for a single session: its latest summary plus all
 * transcript lines, chunked. Idempotent — replaces any existing summary and
 * transcript chunks for the session. Best-effort: never throws, so it can't
 * break the summarize request that triggers it.
 */
export async function indexSession(sessionId: number): Promise<void> {
  try {
    const [session] = await db
      .select({ id: sessions.id, campaignId: sessions.campaignId })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session?.campaignId) return;
    const campaignId = session.campaignId;

    const pending: PendingChunk[] = [];

    const [summaryRow] = await db
      .select({ id: summaries.id, text: summaries.text })
      .from(summaries)
      .where(eq(summaries.sessionId, sessionId))
      .orderBy(desc(summaries.createdAt))
      .limit(1);

    if (summaryRow?.text?.trim()) {
      pending.push({
        sourceType: "summary",
        sourceId: summaryRow.id,
        chunkIndex: 0,
        speaker: null,
        content: summaryRow.text.trim(),
      });
    }

    const lines = await db
      .select({ speaker: transcripts.speaker, content: transcripts.content })
      .from(transcripts)
      .where(eq(transcripts.sessionId, sessionId))
      .orderBy(asc(transcripts.timestamp));

    chunkTranscriptLines(lines).forEach((chunk, index) => {
      pending.push({
        sourceType: "transcript",
        sourceId: sessionId,
        chunkIndex: index,
        speaker: chunk.speaker,
        content: chunk.content,
      });
    });

    // Always clear stale rows so re-indexing reflects deletions/edits, even when
    // there is nothing new to write.
    await db
      .delete(searchableChunks)
      .where(
        and(
          eq(searchableChunks.sessionId, sessionId),
          inArray(searchableChunks.sourceType, ["summary", "transcript"]),
        ),
      );

    if (!pending.length) return;

    const embeddings = await embedTexts(pending.map((p) => p.content));

    await db.insert(searchableChunks).values(
      pending.map((p, index) => ({
        campaignId,
        sessionId,
        sourceType: p.sourceType,
        sourceId: p.sourceId,
        chunkIndex: p.chunkIndex,
        speaker: p.speaker,
        content: p.content,
        embedding: embeddings[index] ?? null,
      })),
    );
  } catch (error) {
    console.error("indexSession failed", { sessionId, error });
  }
}

/**
 * (Re)build the search index for a single memory. Idempotent — replaces any
 * existing chunk for the memory. Best-effort: never throws.
 */
export async function indexMemory(memory: {
  id: number;
  campaignId: number;
  content: string;
}): Promise<void> {
  try {
    const content = memory.content.trim();

    await db
      .delete(searchableChunks)
      .where(
        and(
          eq(searchableChunks.sourceType, "memory"),
          eq(searchableChunks.sourceId, memory.id),
        ),
      );

    if (!content) return;

    const embedding = await embedText(content);

    await db.insert(searchableChunks).values({
      campaignId: memory.campaignId,
      sessionId: null,
      sourceType: "memory",
      sourceId: memory.id,
      chunkIndex: 0,
      speaker: null,
      content,
      embedding,
    });
  } catch (error) {
    console.error("indexMemory failed", { memoryId: memory.id, error });
  }
}
