/**
 * Backfill the campaign search index (`searchable_chunks`) for all existing
 * sessions and memories. Safe to re-run — indexing is idempotent.
 *
 * Requires DATABASE_URL and (for embeddings) OPENAI_API_KEY in the environment.
 * Without OPENAI_API_KEY, rows are still indexed for keyword search but without
 * embeddings; re-run later once the key is set to add semantic vectors.
 *
 * Run from the repo root:
 *   bun apps/web/scripts/backfill-search-index.ts
 */
import { db } from "@/db";
import { memories, sessions } from "@/db/schema";
import { embeddingsEnabled } from "@/lib/search/embeddings";
import { indexMemory, indexSession } from "@/lib/search/indexer";

async function main() {
  if (!embeddingsEnabled()) {
    console.warn(
      "OPENAI_API_KEY is not set — backfilling keyword-only chunks (no embeddings).",
    );
  }

  const allSessions = await db
    .select({ id: sessions.id, campaignId: sessions.campaignId })
    .from(sessions);

  let indexedSessions = 0;
  for (const session of allSessions) {
    if (!session.campaignId) continue;
    await indexSession(session.id);
    indexedSessions += 1;
    if (indexedSessions % 25 === 0) {
      console.log(`  …${indexedSessions}/${allSessions.length} sessions`);
    }
  }
  console.log(`Indexed ${indexedSessions} sessions.`);

  const allMemories = await db
    .select({
      id: memories.id,
      campaignId: memories.campaignId,
      content: memories.content,
    })
    .from(memories);

  for (const memory of allMemories) {
    await indexMemory(memory);
  }
  console.log(`Indexed ${allMemories.length} memories.`);

  console.log("Backfill complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
