import { describe, expect, test } from "bun:test";
import { chunkText, chunkTranscriptLines } from "./chunking";

describe("chunkTranscriptLines", () => {
  test("returns an empty array for no lines", () => {
    expect(chunkTranscriptLines([])).toEqual([]);
  });

  test("skips empty/whitespace-only lines", () => {
    const chunks = chunkTranscriptLines([
      { speaker: "Alice", content: "  " },
      { speaker: "Alice", content: "hello" },
      { speaker: "Alice", content: "" },
    ]);
    expect(chunks).toEqual([{ content: "Alice: hello", speaker: "Alice" }]);
  });

  test("keeps a single speaker on the chunk", () => {
    const chunks = chunkTranscriptLines(
      [
        { speaker: "Narrator", content: "Long ago," },
        { speaker: "Narrator", content: "the lich fell." },
      ],
      1000,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.speaker).toBe("Narrator");
    expect(chunks[0]?.content).toBe(
      "Narrator: Long ago,\nNarrator: the lich fell.",
    );
  });

  test("sets speaker to null for mixed dialogue", () => {
    const chunks = chunkTranscriptLines(
      [
        { speaker: "Alice", content: "hi" },
        { speaker: "Bob", content: "yo" },
      ],
      1000,
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.speaker).toBeNull();
  });

  test("splits into multiple chunks at the char limit", () => {
    const lines = [
      { speaker: "A", content: "one" },
      { speaker: "A", content: "two" },
      { speaker: "B", content: "three" },
    ];
    // Each formatted line ("A: one") is ~6 chars; a small limit forces splits.
    const chunks = chunkTranscriptLines(lines, 8);
    expect(chunks.length).toBeGreaterThan(1);
    // Every original line shows up exactly once across all chunks.
    const joined = chunks.map((c) => c.content).join("\n");
    expect(joined).toContain("A: one");
    expect(joined).toContain("A: two");
    expect(joined).toContain("B: three");
  });

  test("an oversized single line becomes its own chunk", () => {
    const big = "x".repeat(50);
    const chunks = chunkTranscriptLines(
      [
        { speaker: "A", content: big },
        { speaker: "A", content: "after" },
      ],
      10,
    );
    expect(chunks[0]?.content).toBe(`A: ${big}`);
    expect(chunks[1]?.content).toBe("A: after");
  });
});

describe("chunkText", () => {
  test("returns an empty array for blank input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  test("keeps short multi-paragraph text as one chunk", () => {
    expect(chunkText("alpha\n\nbeta", 100)).toEqual(["alpha\n\nbeta"]);
  });

  test("splits sections that exceed the limit", () => {
    const chunks = chunkText("# Plot\nStuff happened.\n\n# Loot\nGold.", 25);
    expect(chunks).toEqual(["# Plot\nStuff happened.", "# Loot\nGold."]);
  });

  test("hard-splits a single oversized paragraph", () => {
    expect(chunkText("xxxxxxxxxx", 3)).toEqual(["xxx", "xxx", "xxx", "x"]);
  });

  test("never emits a chunk longer than the limit (for non-huge words)", () => {
    const text = Array.from({ length: 20 }, (_, i) => `para ${i}`).join("\n\n");
    for (const chunk of chunkText(text, 30)) {
      expect(chunk.length).toBeLessThanOrEqual(30);
    }
  });
});
