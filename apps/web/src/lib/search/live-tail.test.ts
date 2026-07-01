import { describe, expect, test } from "bun:test";
import {
  cosineSimilarity,
  keywordScore,
  queryTerms,
  rankTail,
  TAIL_MIN_SIMILARITY,
} from "./live-tail";

describe("cosineSimilarity", () => {
  test("identical vectors score 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  test("orthogonal vectors score 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  test("opposite vectors score -1", () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });

  test("empty, mismatched, or zero vectors score 0 (not NaN)", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });
});

describe("queryTerms", () => {
  test("drops stopwords and keeps content words", () => {
    expect(queryTerms("who was the innkeeper in Barrowmoor")).toEqual([
      "innkeeper",
      "barrowmoor",
    ]);
  });

  test("dedupes and drops single characters", () => {
    expect(queryTerms("lich lich a I")).toEqual(["lich"]);
  });

  test("keeps apostrophe names intact", () => {
    expect(queryTerms("K'thara's ritual")).toEqual(["k'thara's", "ritual"]);
  });
});

describe("keywordScore", () => {
  test("counts matched terms, case-insensitively", () => {
    const terms = ["innkeeper", "barrowmoor"];
    expect(keywordScore(terms, "The Innkeeper of BARROWMOOR waved")).toBe(2);
    expect(keywordScore(terms, "the innkeeper waved")).toBe(1);
    expect(keywordScore(terms, "nothing relevant")).toBe(0);
  });

  test("no terms means no score", () => {
    expect(keywordScore([], "anything")).toBe(0);
  });
});

describe("rankTail", () => {
  const innkeeper = { content: "Karrek the innkeeper poured a drink" };
  const marching = { content: "the party argued about marching order" };
  const ritual = { content: "a stranger whispered about the ritual" };
  const chunks = [innkeeper, marching, ritual];

  test("keyword leg ranks by matched terms and drops non-matches", () => {
    const { semantic, keyword } = rankTail(chunks, "Karrek innkeeper", null, [
      null,
      null,
      null,
    ]);
    expect(semantic).toEqual([]);
    expect(keyword).toEqual([innkeeper]);
  });

  test("semantic leg ranks by cosine and applies the similarity floor", () => {
    const query = [1, 0];
    const dissimilar = [-1, 0.01];
    const embeddings = [
      [0.9, 0.1], // very similar
      [0.5, 0.5], // similar enough
      dissimilar, // must be filtered
    ];
    const { semantic } = rankTail(chunks, "", query, embeddings);
    expect(semantic).toEqual([innkeeper, marching]);
    // sanity: the filtered chunk really is below the floor
    expect(cosineSimilarity(query, dissimilar)).toBeLessThan(
      TAIL_MIN_SIMILARITY,
    );
  });

  test("chunks without embeddings are skipped semantically but still keyword-match", () => {
    const { semantic, keyword } = rankTail(
      chunks,
      "ritual stranger",
      [1, 0],
      [null, null, null],
    );
    expect(semantic).toEqual([]);
    expect(keyword).toEqual([ritual]);
  });

  test("no query embedding degrades to keyword-only", () => {
    const { semantic, keyword } = rankTail(chunks, "marching order", null, []);
    expect(semantic).toEqual([]);
    expect(keyword).toEqual([marching]);
  });
});
