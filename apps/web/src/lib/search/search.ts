import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  gt,
  isNotNull,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  type SearchableChunkSource,
  searchableChunks,
  sessions,
  transcripts,
} from "@/db/schema";
import { chunkTranscriptLines } from "./chunking";
import { EMBEDDING_MODEL, embedText, embedTexts } from "./embeddings";
import { fuse } from "./fusion";
import { rankTail } from "./live-tail";

export type CampaignSearchResult = {
  sourceType: SearchableChunkSource;
  sessionId: number | null;
  sessionNumber: number | null;
  sessionDate: string | null;
  speaker: string | null;
  content: string;
  score: number;
};

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
// Pull extra candidates from each modality before fusing, so a result ranked
// highly by only one method still has a chance to surface.
const CANDIDATE_MULTIPLIER = 3;

// Caps on the query-time "live tail" leg (unindexed lines of an in-progress
// session). The tail is normally a few minutes of dialogue; these bound the
// per-search embedding cost if the debounced indexer has fallen behind.
const MAX_TAIL_LINES = 200;
const MAX_TAIL_CHUNKS = 8;

type RankedRow = {
  id: number;
  sourceType: string;
  sessionId: number | null;
  speaker: string | null;
  content: string;
};

/**
 * Search a campaign's entire indexed history (session summaries, transcript
 * chunks, and memories) using a hybrid of semantic (pgvector) and full-text
 * (Postgres tsvector) retrieval, fused with Reciprocal Rank Fusion. An
 * in-progress session's not-yet-indexed tail is covered at query time (see
 * `liveTail*` below), so "what did we just talk about?" works mid-session.
 *
 * Degrades gracefully: if embeddings are unavailable the semantic legs return
 * nothing and results come from keyword search alone (and vice versa).
 */
export async function searchCampaignHistory(params: {
  campaignId: number;
  query: string;
  limit?: number;
}): Promise<CampaignSearchResult[]> {
  const { campaignId } = params;
  const query = params.query.trim();
  if (!query) return [];

  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const candidateLimit = limit * CANDIDATE_MULTIPLIER;

  // The query embedding is computed once and shared by the indexed semantic
  // leg and the live-tail leg.
  const [queryEmbedding, tailLines] = await Promise.all([
    embedText(query),
    loadLiveTailLines(campaignId),
  ]);

  const [vectorRows, keywordRows, tail] = await Promise.all([
    semanticSearch(campaignId, queryEmbedding, candidateLimit),
    keywordSearch(campaignId, query, candidateLimit),
    liveTailRankings(tailLines, query, queryEmbedding),
  ]);

  const fused = fuse(
    [vectorRows, keywordRows, tail.semantic, tail.keyword],
    limit,
  );
  if (!fused.length) return [];

  const sessionMeta = await loadSessionMeta(campaignId);

  return fused.map(({ row, score }) => {
    const meta = row.sessionId ? sessionMeta.get(row.sessionId) : undefined;
    return {
      sourceType: row.sourceType as SearchableChunkSource,
      sessionId: row.sessionId,
      sessionNumber: meta?.sessionNumber ?? null,
      sessionDate: meta?.startedAt ?? null,
      speaker: row.speaker,
      content: row.content,
      score,
    };
  });
}

async function semanticSearch(
  campaignId: number,
  queryEmbedding: number[] | null,
  limit: number,
): Promise<RankedRow[]> {
  if (!queryEmbedding) return [];

  // Note: pgvector post-filters HNSW results against the WHERE clause, so with
  // many campaigns and the default `hnsw.ef_search` this can return fewer than
  // `limit` rows. Fine at current scale; raise `ef_search` (or add a partial
  // index per campaign) if recall degrades.
  const distance = cosineDistance(searchableChunks.embedding, queryEmbedding);

  return db
    .select({
      id: searchableChunks.id,
      sourceType: searchableChunks.sourceType,
      sessionId: searchableChunks.sessionId,
      speaker: searchableChunks.speaker,
      content: searchableChunks.content,
    })
    .from(searchableChunks)
    .where(
      and(
        eq(searchableChunks.campaignId, campaignId),
        isNotNull(searchableChunks.embedding),
        // Only compare against vectors from the active model — embeddings from
        // different models live in different spaces, so during a migration the
        // not-yet-re-embedded rows must be excluded (they still surface via the
        // keyword leg).
        eq(searchableChunks.embeddingModel, EMBEDDING_MODEL),
      ),
    )
    .orderBy(asc(distance))
    .limit(limit);
}

async function keywordSearch(
  campaignId: number,
  query: string,
  limit: number,
): Promise<RankedRow[]> {
  // websearch_to_tsquery over plainto_tsquery: supports "quoted phrases",
  // OR, and -exclusion in user-typed queries, and never raises a syntax
  // error on malformed input (bare words still AND together like plainto).
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;
  // Normalization flag 1 divides rank by 1 + log(chunk length), so long
  // transcript chunks don't outrank short memories just by containing more
  // words overall.
  const rank = sql<number>`ts_rank(${searchableChunks.searchVector}, ${tsQuery}, 1)`;

  return db
    .select({
      id: searchableChunks.id,
      sourceType: searchableChunks.sourceType,
      sessionId: searchableChunks.sessionId,
      speaker: searchableChunks.speaker,
      content: searchableChunks.content,
    })
    .from(searchableChunks)
    .where(
      and(
        eq(searchableChunks.campaignId, campaignId),
        sql`${searchableChunks.searchVector} @@ ${tsQuery}`,
      ),
    )
    .orderBy(desc(rank))
    .limit(limit);
}

type TailLine = { sessionId: number; speaker: string; content: string };

/**
 * Load the "live tail": transcript lines of the campaign's in-progress
 * session(s) above the indexer's high-water mark
 * (`sessions.last_indexed_transcript_id`), i.e. lines no index run has
 * captured yet. The watermark is exact — it's set to the max transcript id
 * each index run selected — so nothing falls between the index and the tail.
 */
async function loadLiveTailLines(campaignId: number): Promise<TailLine[]> {
  const active = await db
    .select({
      id: sessions.id,
      watermark: sessions.lastIndexedTranscriptId,
    })
    .from(sessions)
    .where(
      and(eq(sessions.campaignId, campaignId), eq(sessions.status, "active")),
    );

  const lines: TailLine[] = [];
  for (const session of active) {
    // Newest lines win when the tail exceeds the cap (e.g. the very first
    // index run hasn't happened yet) — recency is the point of this leg.
    const rows = await db
      .select({
        speaker: transcripts.speaker,
        content: transcripts.content,
      })
      .from(transcripts)
      .where(
        and(
          eq(transcripts.sessionId, session.id),
          gt(transcripts.id, session.watermark ?? 0),
        ),
      )
      .orderBy(desc(transcripts.id))
      .limit(MAX_TAIL_LINES);
    rows.reverse();
    lines.push(...rows.map((row) => ({ ...row, sessionId: session.id })));
  }
  return lines;
}

/**
 * Chunk the live tail, embed it at query time (a handful of chunks — the tail
 * is bounded by the index debounce window), and rank it into two extra lists
 * for RRF, mirroring the indexed semantic + keyword legs. Tail rows get
 * negative synthetic ids so they can never collide with `searchable_chunks`
 * ids inside `fuse`.
 */
async function liveTailRankings(
  lines: TailLine[],
  query: string,
  queryEmbedding: number[] | null,
): Promise<{ semantic: RankedRow[]; keyword: RankedRow[] }> {
  if (!lines.length) return { semantic: [], keyword: [] };

  const bySession = new Map<number, TailLine[]>();
  for (const line of lines) {
    const group = bySession.get(line.sessionId) ?? [];
    group.push(line);
    bySession.set(line.sessionId, group);
  }

  const candidates: RankedRow[] = [];
  let syntheticId = -1;
  for (const [sessionId, sessionLines] of bySession) {
    const chunks = chunkTranscriptLines(sessionLines).slice(-MAX_TAIL_CHUNKS);
    for (const chunk of chunks) {
      candidates.push({
        id: syntheticId--,
        sourceType: "transcript",
        sessionId,
        speaker: chunk.speaker,
        content: chunk.content,
      });
    }
  }

  const embeddings = queryEmbedding
    ? await embedTexts(candidates.map((c) => c.content))
    : candidates.map(() => null);

  return rankTail(candidates, query, queryEmbedding, embeddings);
}

type SessionMeta = { sessionNumber: number; startedAt: string | null };

/** Map session id → human-friendly session number and start date. */
async function loadSessionMeta(
  campaignId: number,
): Promise<Map<number, SessionMeta>> {
  const rows = await db
    .select({ id: sessions.id, startedAt: sessions.startedAt })
    .from(sessions)
    .where(eq(sessions.campaignId, campaignId))
    .orderBy(asc(sessions.startedAt));

  const meta = new Map<number, SessionMeta>();
  rows.forEach((row, index) => {
    meta.set(row.id, {
      sessionNumber: index + 1,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    });
  });
  return meta;
}
