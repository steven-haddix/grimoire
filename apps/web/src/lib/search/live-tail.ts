// Pure, dependency-free ranking for the "live tail" — transcript lines of an
// in-progress session that the debounced indexer hasn't captured yet. The tail
// is small (bounded by the index debounce window), so instead of an index we
// score a handful of chunks at query time. Kept free of any database/embedding
// imports so it can be unit-tested in isolation.

// A tail chunk must be at least this cosine-similar to the query to enter the
// semantic ranking. The DB semantic leg returns its top-N regardless of
// absolute similarity, and RRF copes because that list is long; the tail list
// is 2–8 items, where "rank 1 of 3" means nothing without an absolute floor.
export const TAIL_MIN_SIMILARITY = 0.25;

// English function words excluded from tail keyword matching. The indexed
// keyword leg gets this from Postgres' english dictionary; this mirrors just
// enough of it that "who was the innkeeper" matches on "innkeeper", not "the".
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "did",
  "do",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "to",
  "up",
  "us",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "you",
  "your",
]);

/**
 * Cosine similarity between two equal-length vectors. Returns 0 for empty or
 * mismatched inputs rather than NaN.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Meaningful search terms from a user query: lowercased words, stopwords out. */
export function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}']+/u)
        .filter((term) => term.length >= 2 && !STOPWORDS.has(term)),
    ),
  ];
}

/** How many of the query's meaningful terms appear in the content. */
export function keywordScore(terms: string[], content: string): number {
  if (!terms.length) return 0;
  const haystack = content.toLowerCase();
  let matched = 0;
  for (const term of terms) {
    if (haystack.includes(term)) matched += 1;
  }
  return matched;
}

export type TailRankings<T> = {
  /** Chunks at or above TAIL_MIN_SIMILARITY, most similar first. */
  semantic: T[];
  /** Chunks matching ≥1 meaningful query term, most terms matched first. */
  keyword: T[];
};

/**
 * Rank tail chunks against a query, mirroring the two indexed retrieval legs
 * so the results can be fed straight into RRF as additional ranked lists.
 * `embeddings[i]` is the embedding for `items[i]` (null when unavailable);
 * with no query embedding the semantic list is simply empty and results come
 * from keyword matching alone — the same degradation as the indexed legs.
 */
export function rankTail<T extends { content: string }>(
  items: T[],
  query: string,
  queryEmbedding: number[] | null,
  embeddings: (number[] | null)[],
): TailRankings<T> {
  const semantic: Array<{ item: T; score: number }> = [];
  if (queryEmbedding) {
    items.forEach((item, index) => {
      const embedding = embeddings[index];
      if (!embedding) return;
      const score = cosineSimilarity(queryEmbedding, embedding);
      if (score >= TAIL_MIN_SIMILARITY) semantic.push({ item, score });
    });
    semantic.sort((a, b) => b.score - a.score);
  }

  const terms = queryTerms(query);
  const keyword: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const score = keywordScore(terms, item.content);
    if (score > 0) keyword.push({ item, score });
  }
  keyword.sort((a, b) => b.score - a.score);

  return {
    semantic: semantic.map((s) => s.item),
    keyword: keyword.map((s) => s.item),
  };
}
