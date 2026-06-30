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
import { embedText } from "./embeddings";

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
// Reciprocal Rank Fusion constant. 60 is the value from the original RRF paper
// and is a sane default that keeps any single rank from dominating.
const RRF_K = 60;

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

/** Merge ranked result lists with Reciprocal Rank Fusion. */
function fuse(
  rankings: RankedRow[][],
  limit: number,
): Array<{ row: RankedRow; score: number }> {
  const scores = new Map<number, { row: RankedRow; score: number }>();

  for (const ranking of rankings) {
    ranking.forEach((row, index) => {
      const contribution = 1 / (RRF_K + index + 1);
      const existing = scores.get(row.id);
      if (existing) {
        existing.score += contribution;
      } else {
        scores.set(row.id, { row, score: contribution });
      }
    });
  }

  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit);
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
