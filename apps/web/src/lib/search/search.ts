import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  isNotNull,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  type SearchableChunkSource,
  searchableChunks,
  sessions,
} from "@/db/schema";
import { EMBEDDING_MODEL, embedText } from "./embeddings";
import { fuse } from "./fusion";

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
 * (Postgres tsvector) retrieval, fused with Reciprocal Rank Fusion.
 *
 * Degrades gracefully: if embeddings are unavailable the semantic leg returns
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

  const [vectorRows, keywordRows] = await Promise.all([
    semanticSearch(campaignId, query, candidateLimit),
    keywordSearch(campaignId, query, candidateLimit),
  ]);

  const fused = fuse([vectorRows, keywordRows], limit);
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
  query: string,
  limit: number,
): Promise<RankedRow[]> {
  const embedding = await embedText(query);
  if (!embedding) return [];

  // Note: pgvector post-filters HNSW results against the WHERE clause, so with
  // many campaigns and the default `hnsw.ef_search` this can return fewer than
  // `limit` rows. Fine at current scale; raise `ef_search` (or add a partial
  // index per campaign) if recall degrades.
  const distance = cosineDistance(searchableChunks.embedding, embedding);

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
  const tsQuery = sql`plainto_tsquery('english', ${query})`;
  const rank = sql<number>`ts_rank(${searchableChunks.searchVector}, ${tsQuery})`;

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
