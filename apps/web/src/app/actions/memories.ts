"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/db";
import { campaigns, memories, searchableChunks } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { indexMemory } from "@/lib/search/indexer";

const MEMORY_CATEGORIES = [
  "lore",
  "character",
  "rule",
  "meta",
  "other",
] as const;
type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

async function assertCampaignAccess(campaignId: number) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");

  const adminGuilds = await getUserAdminGuilds();
  if (!adminGuilds.some((g) => g.id === campaign.guildId)) {
    throw new Error("Forbidden");
  }
  return campaign;
}

export async function createMemory(formData: FormData) {
  const campaignId = Number(formData.get("campaignId"));
  if (!Number.isFinite(campaignId)) throw new Error("Invalid campaign");

  const content = String(formData.get("content") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "other").trim();
  const source = String(formData.get("source") ?? "").trim();

  if (!content) throw new Error("Memory content required");

  const category: MemoryCategory = (
    MEMORY_CATEGORIES as readonly string[]
  ).includes(categoryRaw)
    ? (categoryRaw as MemoryCategory)
    : "other";

  await assertCampaignAccess(campaignId);

  const [inserted] = await db
    .insert(memories)
    .values({
      campaignId,
      content,
      category,
      source: source || null,
    })
    .returning();

  // Index for campaign search after the response flushes, like the agent's
  // rememberFact tool does. Best-effort — indexMemory never throws.
  if (inserted) {
    after(() => indexMemory({ id: inserted.id, campaignId, content }));
  }

  revalidatePath(`/account/c/${campaignId}/memories`);
  revalidatePath(`/account/c/${campaignId}`);
}

export async function deleteMemory(memoryId: number, campaignId: number) {
  await assertCampaignAccess(campaignId);
  // Remove the memory's search-index chunk in the same transaction, or
  // searchCampaignHistory keeps surfacing the "forgotten" fact.
  await db.transaction(async (tx) => {
    await tx
      .delete(memories)
      .where(
        and(eq(memories.id, memoryId), eq(memories.campaignId, campaignId)),
      );
    await tx
      .delete(searchableChunks)
      .where(
        and(
          eq(searchableChunks.sourceType, "memory"),
          eq(searchableChunks.sourceId, memoryId),
        ),
      );
  });
  revalidatePath(`/account/c/${campaignId}/memories`);
  revalidatePath(`/account/c/${campaignId}`);
}
