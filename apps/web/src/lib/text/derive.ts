// Helpers for deriving plain-text labels out of markdown bodies (session
// summaries, memory blobs). These produce strings for compact UI surfaces
// — titles, hooks, card heads — so they strip inline markdown rather than
// rendering it.

export function stripInlineMarkdown(input: string): string {
  return (
    input
      // bold ** or __
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      // italic * or _ — match non-greedy, avoid swallowing across lines
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
      // inline code
      .replace(/`([^`]+)`/g, "$1")
      // links [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // stray heading hashes at the start of an inline string
      .replace(/^#+\s+/, "")
      // stray blockquote / list markers
      .replace(/^>\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .trim()
  );
}

export function deriveTitle(
  text: string | undefined | null,
  fallback = "Untitled session",
): string {
  if (!text) return fallback;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Prefer the first markdown heading, regardless of level.
  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const cleaned = stripInlineMarkdown(headingMatch[2] ?? "");
      if (cleaned) {
        return cleaned.length > 80 ? `${cleaned.slice(0, 80)}…` : cleaned;
      }
    }
  }

  // Fall through to the first prose line.
  for (const line of lines) {
    if (line.startsWith("#")) continue;
    const cleaned = stripInlineMarkdown(line);
    if (cleaned.length > 6) {
      return cleaned.length > 80 ? `${cleaned.slice(0, 80)}…` : cleaned;
    }
  }

  return fallback;
}

export function deriveHook(
  text: string | undefined | null,
  maxLength = 240,
): string | null {
  if (!text) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith(">")) continue;
    if (line.startsWith("-") || line.startsWith("*")) continue;
    const cleaned = stripInlineMarkdown(line);
    if (cleaned.length < 16) continue;
    return cleaned.length > maxLength
      ? `${cleaned.slice(0, maxLength)}…`
      : cleaned;
  }
  return null;
}

export function firstSentence(text: string, maxLength = 100): string {
  const trimmed = stripInlineMarkdown(text.trim());
  const period = trimmed.indexOf(".");
  if (period > 12 && period < maxLength) {
    return trimmed.slice(0, period + 1);
  }
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}…`
    : trimmed;
}

export function remainderAfterFirstSentence(
  text: string,
  maxLength = 100,
): string {
  const trimmed = stripInlineMarkdown(text.trim());
  const head = firstSentence(text, maxLength);
  if (trimmed === head || trimmed.startsWith(`${head.slice(0, -1)}…`)) {
    return "";
  }
  return trimmed.slice(head.length).trim();
}
