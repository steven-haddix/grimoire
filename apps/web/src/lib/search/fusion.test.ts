import { describe, expect, test } from "bun:test";
import { fuse, RRF_K } from "./fusion";

type Row = { id: number; label?: string };

describe("fuse (reciprocal rank fusion)", () => {
  test("returns an empty array when all rankings are empty", () => {
    expect(fuse<Row>([[], []], 5)).toEqual([]);
  });

  test("scores a single list as 1/(k+rank)", () => {
    const result = fuse<Row>([[{ id: 1 }, { id: 2 }]], 5);
    expect(result.map((r) => r.row.id)).toEqual([1, 2]);
    expect(result[0]?.score).toBeCloseTo(1 / (RRF_K + 1), 10);
    expect(result[1]?.score).toBeCloseTo(1 / (RRF_K + 2), 10);
  });

  test("an item ranked by both legs outranks items ranked by one", () => {
    const vector = [{ id: 1 }, { id: 2 }];
    const keyword = [{ id: 2 }, { id: 3 }];
    const result = fuse<Row>([vector, keyword], 10);

    // id 2 appears in both lists, so its summed score wins.
    expect(result[0]?.row.id).toBe(2);
    expect(result[0]?.score).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1), 10);
    // The remaining two each appear once and tie-break by insertion/score.
    expect(result.map((r) => r.row.id).sort()).toEqual([1, 2, 3]);
  });

  test("dedupes by id and keeps the first-seen row object", () => {
    const first = { id: 7, label: "vector" };
    const second = { id: 7, label: "keyword" };
    const result = fuse<Row>([[first], [second]], 5);
    expect(result).toHaveLength(1);
    expect(result[0]?.row.label).toBe("vector");
  });

  test("degrades to the non-empty leg when the other is empty", () => {
    const result = fuse<Row>([[{ id: 1 }, { id: 2 }], []], 5);
    expect(result.map((r) => r.row.id)).toEqual([1, 2]);
  });

  test("respects the limit", () => {
    const result = fuse<Row>([[{ id: 1 }, { id: 2 }, { id: 3 }]], 2);
    expect(result.map((r) => r.row.id)).toEqual([1, 2]);
  });
});
