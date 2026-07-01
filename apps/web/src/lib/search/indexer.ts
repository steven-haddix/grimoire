import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  type SearchableChunkSource,
  searchableChunks,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import { chunkText, chunkTranscriptLines } from "./chunking";
import { embeddingMeta, embedText, embedTexts } from "./embeddings";

type PendingChunk = {
  sourceType: SearchableChunkSource;
  sourceId: number | null;
  chunkIndex: number;
  speaker: string | null;
  content: string;
};

// How long after an index run before another mid-session run may start. The
// live-tail search leg covers everything above the watermark at query time,
// so this only bounds index staleness, not search freshness.
export const LIVE_INDEX_DEBOUNCE_MS = 5 * 60_000;

// Advisory-lock namespace for per-session index runs (arbitrary, just must
// not collide with other advisory locks in this app — there are none today).
const INDEX_LOCK_NAMESPACE = 815;

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
      .select({
        id: transcripts.id,
        speaker: transcripts.speaker,
        content: transcripts.content,
      })
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
      // Serialize runs per session. With ingest-triggered mid-session indexing
      // two runs can overlap (ingest debounce vs summarize), and under read
      // committed both could pass the delete before either inserts, leaving
      // duplicate chunks. Released automatically at commit/rollback.
      await tx.execute(
        sql`select pg_advisory_xact_lock(${INDEX_LOCK_NAMESPACE}, ${sessionId})`,
      );

      await tx
        .delete(searchableChunks)
        .where(
          and(
            eq(searchableChunks.sessionId, sessionId),
            inArray(searchableChunks.sourceType, ["summary", "transcript"]),
          ),
        );

      if (pending.length) {
        await tx.insert(searchableChunks).values(
          pending.map((p, index) => {
            const embedding = embeddings[index] ?? null;
            return {
              campaignId,
              sessionId,
              sourceType: p.sourceType,
              sourceId: p.sourceId,
              chunkIndex: p.chunkIndex,
              speaker: p.speaker,
              content: p.content,
              embedding,
              ...embeddingMeta(embedding),
            };
          }),
        );
      }

      // Record exactly which transcript rows this run captured; lines above
      // this id are the "live tail" that search covers at query time.
      await tx
        .update(sessions)
        .set({
          lastIndexedTranscriptId: lines.length
            ? lines.reduce((max, l) => (l.id > max ? l.id : max), 0)
            : null,
        })
        .where(eq(sessions.id, sessionId));
    });
  } catch (error) {
    console.error("indexSession failed", { sessionId, error });
  }
}

/**
 * Debounced mid-session (re)index, scheduled from `/api/ingest` on every
 * transcript line. The atomic claim on `sessions.last_indexed_at` means at
 * most one run starts per debounce window no matter how many ingest calls
 * race, and a crashed run self-heals: the next ingest after the window
 * re-triggers, and `/api/summarize` always runs the authoritative final pass.
 * Best-effort: never throws.
 */
export async function maybeIndexSession(sessionId: number): Promise<void> {
  try {
    const claimed = await db
      .update(sessions)
      .set({ lastIndexedAt: sql`now()` })
      .where(
        and(
          eq(sessions.id, sessionId),
          or(
            isNull(sessions.lastIndexedAt),
            lt(
              sessions.lastIndexedAt,
              sql`now() - make_interval(secs => ${LIVE_INDEX_DEBOUNCE_MS / 1000})`,
            ),
          ),
        ),
      )
      .returning();
    if (!claimed.length) return;
  } catch (error) {
    console.error("maybeIndexSession claim failed", { sessionId, error });
    return;
  }
  await indexSession(sessionId);
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
        ...embeddingMeta(embedding),
      });
    });
  } catch (error) {
    console.error("indexMemory failed", { memoryId: memory.id, error });
  }
}
