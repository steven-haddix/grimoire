// Pure, dependency-free rank fusion for hybrid search. Kept free of any
// database imports so it can be unit-tested in isolation.

// Reciprocal Rank Fusion constant. 60 is the value from the original RRF paper
// and is a sane default that keeps any single rank from dominating.
export const RRF_K = 60;

/**
 * Merge ranked result lists with Reciprocal Rank Fusion. Each input list is
 * assumed ordered best-first; a row's score is the sum of `1 / (RRF_K + rank)`
 * across the lists it appears in (deduped by `id`). Returns the top `limit`
 * rows by fused score. Degrades naturally: an empty list contributes nothing,
 * so a single non-empty list just yields its own ranking.
 */
export function fuse<T extends { id: number }>(
  rankings: T[][],
  limit: number,
): Array<{ row: T; score: number }> {
  const scores = new Map<number, { row: T; score: number }>();

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
