import { desc, eq } from "drizzle-orm";
import type { RuntimeDb } from "../client";
import { memories } from "../schema-runtime";
import type { MemoryCategory } from "../types";

export async function rememberFact(
  db: RuntimeDb,
  input: {
    campaignId: number;
    content: string;
    category: MemoryCategory;
    source?: string;
  },
) {
  await db.insert(memories).values({
    campaignId: input.campaignId,
    content: input.content,
    category: input.category,
    source: input.source ?? null,
  });
}

export async function listCampaignMemories(db: RuntimeDb, campaignId: number) {
  return db
    .select({
      id: memories.id,
      content: memories.content,
      category: memories.category,
      source: memories.source,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .where(eq(memories.campaignId, campaignId))
    .orderBy(desc(memories.createdAt));
}
