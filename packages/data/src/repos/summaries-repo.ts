import { desc, eq } from "drizzle-orm";
import type { RuntimeDb } from "../client";
import { summaries } from "../schema-runtime";

export async function insertSummary(
  db: RuntimeDb,
  input: { sessionId: number; text: string },
) {
  const [summary] = await db
    .insert(summaries)
    .values({
      sessionId: input.sessionId,
      text: input.text,
    })
    .returning();

  return summary ?? null;
}

export async function getLatestSummary(
  db: RuntimeDb,
  sessionId: number,
): Promise<string | null> {
  const [summary] = await db
    .select({ text: summaries.text })
    .from(summaries)
    .where(eq(summaries.sessionId, sessionId))
    .orderBy(desc(summaries.createdAt))
    .limit(1);

  return summary?.text ?? null;
}
