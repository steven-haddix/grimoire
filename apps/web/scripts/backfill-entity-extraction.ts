/**
 * Backfill the campaign entity graph by running session-end entity extraction
 * over existing completed sessions, oldest first (so last-seen and fact
 * history accrue in chronological order). Safe to re-run — extraction is
 * idempotent per session, and re-runs replace that session's extractor facts.
 *
 * Requires DATABASE_URL, ANTHROPIC_API_KEY (extraction model) and, for
 * embeddings, OPENAI_API_KEY in the environment.
 *
 * NOTE: this makes one Claude call per session. For a long campaign that is
 * real money — pass a session id to backfill a single session first and eyeball
 * the result in the Characters page before running the full history:
 *
 *   bun apps/web/scripts/backfill-entity-extraction.ts [sessionId]
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { runExtraction } from "@/lib/extraction/run";

async function main() {
  const argId = process.argv[2] ? Number(process.argv[2]) : null;
  if (argId != null && !Number.isFinite(argId)) {
    console.error(`Invalid session id: ${process.argv[2]}`);
    process.exit(1);
  }

  const targets = argId
    ? await db
        .select({ id: sessions.id, campaignId: sessions.campaignId })
        .from(sessions)
        .where(eq(sessions.id, argId))
    : await db
        .select({ id: sessions.id, campaignId: sessions.campaignId })
        .from(sessions)
        .where(eq(sessions.status, "completed"))
        .orderBy(asc(sessions.startedAt));

  let processed = 0;
  for (const session of targets) {
    if (!session.campaignId) continue;
    console.log(`Extracting session ${session.id}…`);
    // runExtraction never throws; failures are recorded in extraction_runs.
    await runExtraction(session.id);
    processed += 1;
  }

  console.log(
    `Backfill complete: ${processed} session(s) processed. Check extraction_runs for per-session status.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
