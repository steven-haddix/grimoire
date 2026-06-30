import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  type SearchableChunkSource,
  searchableChunks,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import { chunkText, chunkTranscriptLines } from "./chunking";
import { embedText, embedTexts } from "./embeddings";

type PendingChunk = {
  sourceType: SearchableChunkSource;
  sourceId: number | null;
  chunkIndex: number;
  speaker: string | null;
  content: string;
};

/**
 * (Re)build the search index for a single session: its latest summary (chunked
 * by section) plus all transcript lines (chunked). Idempotent — replaces any
 * existing summary and transcript chunks for the session. Best-effort: never
 * throws, so it can't break the summarize request that triggers it.
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
      // Summaries are multi-section ("Plot, Combat, Loot"), so chunk them too —
      // a single embedding over the whole document dilutes semantic recall.
      chunkText(summaryRow.text).forEach((content, index) => {
        pending.push({
          sourceType: "summary",
          sourceId: summaryRow.id,
          chunkIndex: index,
          speaker: null,
          content,
        });
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

    // Embed BEFORE touching the index. The embedding call is the slow,
    // failure-prone step; running it first means a failure or hang leaves the
    // existing index intact rather than wiping a session's history.
    const embeddings = pending.length
      ? await embedTexts(pending.map((p) => p.content))
      : [];

    // Replace this session's summary + transcript chunks atomically, so a crash
    // can't leave the session half-indexed. We always delete (to reflect
    // removed transcripts/summaries) and re-insert whatever is current.
    await db.transaction(async (tx) => {
      await tx
        .delete(searchableChunks)
        .where(
          and(
            eq(searchableChunks.sessionId, sessionId),
            inArray(searchableChunks.sourceType, ["summary", "transcript"]),
          ),
        );

      if (!pending.length) return;

      await tx.insert(searchableChunks).values(
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
    });
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

    // Embed before touching the index, for the same reason as indexSession: a
    // failed or hung embedding must not leave the memory unsearchable.
    const embedding = content ? await embedText(content) : null;

    await db.transaction(async (tx) => {
      await tx
        .delete(searchableChunks)
        .where(
          and(
            eq(searchableChunks.sourceType, "memory"),
            eq(searchableChunks.sourceId, memory.id),
          ),
        );

      if (!content) return;

      await tx.insert(searchableChunks).values({
        campaignId: memory.campaignId,
        sessionId: null,
        sourceType: "memory",
        sourceId: memory.id,
        chunkIndex: 0,
        speaker: null,
        content,
        embedding,
      });
    });
  } catch (error) {
    console.error("indexMemory failed", { memoryId: memory.id, error });
  }
}
