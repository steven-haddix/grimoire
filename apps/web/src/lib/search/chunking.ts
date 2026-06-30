// Pure, dependency-free text chunking for the search index. Kept free of any
// database/embedding imports so it can be unit-tested in isolation.

// Roughly how many characters go into one embeddable chunk. Small enough to
// stay semantically focused, large enough to keep surrounding context.
export const CHUNK_CHAR_LIMIT = 1500;

type TranscriptLine = { speaker: string; content: string };

export type TranscriptChunk = { content: string; speaker: string | null };

/**
 * Group consecutive transcript lines into larger, embeddable chunks. Each line
 * is rendered as `Speaker: text`; a chunk's `speaker` is set only when every
 * line in it shares one speaker (otherwise null for mixed dialogue).
 */
export function chunkTranscriptLines(
  lines: TranscriptLine[],
  charLimit: number = CHUNK_CHAR_LIMIT,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  let current: string[] = [];
  let currentLen = 0;
  const speakers = new Set<string>();

  const flush = () => {
    if (!current.length) return;
    chunks.push({
      content: current.join("\n"),
      speaker: speakers.size === 1 ? ([...speakers][0] ?? null) : null,
    });
    current = [];
    currentLen = 0;
    speakers.clear();
  };

  for (const line of lines) {
    const text = line.content.trim();
    if (!text) continue;
    const formatted = `${line.speaker}: ${text}`;
    if (current.length && currentLen + formatted.length > charLimit) {
      flush();
    }
    speakers.add(line.speaker);
    current.push(formatted);
    currentLen += formatted.length + 1;
  }
  flush();

  return chunks;
}

/**
 * Split a free-form document (e.g. a multi-section session summary) into
 * embeddable chunks. Splits on blank lines (paragraph / markdown section
 * boundaries), packs paragraphs up to `charLimit`, and hard-splits any single
 * paragraph that exceeds it. Returns an empty array for blank input.
 */
export function chunkText(
  text: string,
  charLimit: number = CHUNK_CHAR_LIMIT,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current) {
      chunks.push(current);
      current = "";
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > charLimit) {
      flush();
      for (let i = 0; i < paragraph.length; i += charLimit) {
        chunks.push(paragraph.slice(i, i + charLimit));
      }
      continue;
    }
    if (current && current.length + 2 + paragraph.length > charLimit) {
      flush();
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();

  return chunks;
}
