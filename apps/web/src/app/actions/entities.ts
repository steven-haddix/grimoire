"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/db";
import { campaigns, entities, entityAliases, entityFacts } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { indexEntities } from "@/lib/extraction/indexing";

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

async function getCampaignEntity(campaignId: number, entityId: number) {
  const entity = await db.query.entities.findFirst({
    where: and(eq(entities.id, entityId), eq(entities.campaignId, campaignId)),
  });
  if (!entity) throw new Error("Entity not found");
  return entity;
}

function revalidateCharacterPages(campaignId: number, entityId?: number) {
  revalidatePath(`/account/c/${campaignId}/characters`);
  if (entityId != null) {
    revalidatePath(`/account/c/${campaignId}/characters/${entityId}`);
  }
}

/**
 * Record a DM-sourced fact. Facts are append-only: this supersedes the
 * current value of the key without erasing history, and the extractor sees
 * the [dm] provenance so it won't casually override it.
 */
export async function addEntityFact(formData: FormData) {
  const campaignId = Number(formData.get("campaignId"));
  const entityId = Number(formData.get("entityId"));
  if (!Number.isFinite(campaignId) || !Number.isFinite(entityId)) {
    throw new Error("Invalid entity");
  }

  const key = String(formData.get("key") ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, "_");
  const value = String(formData.get("value") ?? "").trim();
  if (!key || !value) throw new Error("Fact key and value required");

  await assertCampaignAccess(campaignId);
  await getCampaignEntity(campaignId, entityId);

  await db.insert(entityFacts).values({
    entityId,
    key,
    value,
    source: "dm",
    confidence: null,
    sourceSessionId: null,
  });

  after(() => indexEntities(campaignId, [entityId]));
  revalidateCharacterPages(campaignId, entityId);
}

/** Rename an entity; the old name is kept as an alias so matching still works. */
export async function renameEntity(
  campaignId: number,
  entityId: number,
  name: string,
) {
  const newName = name.trim();
  if (!newName) throw new Error("Name required");

  await assertCampaignAccess(campaignId);
  const entity = await getCampaignEntity(campaignId, entityId);

  await db.transaction(async (tx) => {
    await tx
      .update(entities)
      .set({ name: newName })
      .where(eq(entities.id, entityId));
    if (entity.name.toLowerCase() !== newName.toLowerCase()) {
      await tx
        .insert(entityAliases)
        .values({ entityId, alias: entity.name })
        .onConflictDoNothing();
    }
  });

  after(() => indexEntities(campaignId, [entityId]));
  revalidateCharacterPages(campaignId, entityId);
}

/**
 * Merge a duplicate into a surviving entity. The duplicate becomes a
 * redirect: its name and aliases move onto the survivor so extraction and
 * lookup keep matching, and the reconciler routes future observations to the
 * survivor.
 */
export async function mergeEntities(
  campaignId: number,
  sourceEntityId: number,
  targetEntityId: number,
) {
  if (sourceEntityId === targetEntityId) {
    throw new Error("Cannot merge an entity into itself");
  }

  await assertCampaignAccess(campaignId);
  const source = await getCampaignEntity(campaignId, sourceEntityId);
  const target = await getCampaignEntity(campaignId, targetEntityId);
  if (target.mergedIntoEntityId != null || target.suppressedAt) {
    throw new Error("Target entity is not active");
  }

  const sourceAliases = await db
    .select({ alias: entityAliases.alias })
    .from(entityAliases)
    .where(eq(entityAliases.entityId, sourceEntityId));

  await db.transaction(async (tx) => {
    await tx
      .update(entities)
      .set({ mergedIntoEntityId: targetEntityId })
      .where(eq(entities.id, sourceEntityId));

    const aliasValues = [source.name, ...sourceAliases.map((a) => a.alias)].map(
      (alias) => ({ entityId: targetEntityId, alias }),
    );
    if (aliasValues.length) {
      await tx.insert(entityAliases).values(aliasValues).onConflictDoNothing();
    }
  });

  after(() => indexEntities(campaignId, [sourceEntityId, targetEntityId]));
  revalidateCharacterPages(campaignId, sourceEntityId);
  revalidateCharacterPages(campaignId, targetEntityId);
}

/**
 * Tombstone an entity (e.g. an extraction hallucination). The reconciler
 * refuses to recreate suppressed entities, so it stays gone across future
 * sessions. Reversible via restoreEntity.
 */
export async function suppressEntity(campaignId: number, entityId: number) {
  await assertCampaignAccess(campaignId);
  await getCampaignEntity(campaignId, entityId);

  await db
    .update(entities)
    .set({ suppressedAt: new Date() })
    .where(eq(entities.id, entityId));

  after(() => indexEntities(campaignId, [entityId]));
  revalidateCharacterPages(campaignId, entityId);
}

export async function restoreEntity(campaignId: number, entityId: number) {
  await assertCampaignAccess(campaignId);
  await getCampaignEntity(campaignId, entityId);

  await db
    .update(entities)
    .set({ suppressedAt: null })
    .where(eq(entities.id, entityId));

  after(() => indexEntities(campaignId, [entityId]));
  revalidateCharacterPages(campaignId, entityId);
}

/** Assign (or clear) the player behind a PC. */
export async function assignPlayer(
  campaignId: number,
  entityId: number,
  playerId: number | null,
) {
  await assertCampaignAccess(campaignId);
  const entity = await getCampaignEntity(campaignId, entityId);
  if (entity.type !== "pc") {
    throw new Error("Only player characters can be assigned a player");
  }

  await db.update(entities).set({ playerId }).where(eq(entities.id, entityId));

  revalidateCharacterPages(campaignId, entityId);
}
