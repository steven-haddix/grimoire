import type { GraphEntity } from "./types";

// Generous default: recall matters more than precision here — a missed
// candidate means the model can't match and may create a duplicate, while an
// extra candidate just costs a few prompt tokens.
const DEFAULT_LIMIT = 60;

/**
 * Pick which known entities to show the extraction model as match candidates.
 * Cheap, recall-oriented prefilter — this is NOT identity matching (that's
 * the model's job); it only bounds prompt size for large campaigns:
 *
 * - all live PCs are always included (the party is in every session)
 * - everything else is included iff its name or an alias literally appears in
 *   the text (case-insensitive, word-bounded)
 * - suppressed and merged-away entities are never candidates
 */
export function selectCandidates(
  entities: GraphEntity[],
  text: string,
  options?: { limit?: number },
): GraphEntity[] {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const haystack = text.toLowerCase();

  const pcs: GraphEntity[] = [];
  const mentioned: GraphEntity[] = [];

  for (const entity of entities) {
    if (entity.suppressedAt || entity.mergedIntoEntityId != null) continue;

    if (entity.type === "pc") {
      pcs.push(entity);
      continue;
    }

    if (isMentioned(entity, haystack)) {
      mentioned.push(entity);
    }
  }

  return [...pcs, ...mentioned].slice(0, limit);
}

function isMentioned(entity: GraphEntity, haystack: string): boolean {
  for (const name of [entity.name, ...entity.aliases]) {
    const needle = name.trim().toLowerCase();
    if (!needle) continue;
    // Word-bounded literal match, so "Bob" doesn't fire on "bobbing". \b
    // doesn't work at non-word boundaries (e.g. names ending in ")"), so
    // check the neighbouring characters manually.
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const before = index === 0 ? "" : haystack[index - 1];
      const after =
        index + needle.length >= haystack.length
          ? ""
          : haystack[index + needle.length];
      if (!isWordChar(before) && !isWordChar(after)) return true;
      index = haystack.indexOf(needle, index + 1);
    }
  }
  return false;
}

function isWordChar(char: string | undefined): boolean {
  return !!char && /[\p{L}\p{N}_]/u.test(char);
}
