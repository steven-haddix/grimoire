import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import type { EntityType } from "@/db/schema";
import { entities, entityAliases, entityFacts } from "@/db/schema";
import type { GraphEntity } from "./types";

/**
 * Load the full entity graph for a campaign as plain objects: every entity
 * (including suppressed and merged ones — the reconciler needs those for
 * tombstone/redirect checks) with its aliases and the latest value of each
 * fact key.
 */
export async function loadCampaignGraph(
  campaignId: number,
): Promise<GraphEntity[]> {
  const entityRows = await db
    .select({
      id: entities.id,
      type: entities.type,
      name: entities.name,
      suppressedAt: entities.suppressedAt,
      mergedIntoEntityId: entities.mergedIntoEntityId,
      playerId: entities.playerId,
      lastSeenSessionId: entities.lastSeenSessionId,
    })
    .from(entities)
    .where(eq(entities.campaignId, campaignId));

  if (!entityRows.length) return [];
  const entityIds = entityRows.map((e) => e.id);

  const aliasRows = await db
    .select({
      entityId: entityAliases.entityId,
      alias: entityAliases.alias,
    })
    .from(entityAliases)
    .where(inArray(entityAliases.entityId, entityIds));

  // Ordered ascending so the newest row per (entity, key) wins the reduce.
  const factRows = await db
    .select({
      entityId: entityFacts.entityId,
      key: entityFacts.key,
      value: entityFacts.value,
      source: entityFacts.source,
    })
    .from(entityFacts)
    .where(inArray(entityFacts.entityId, entityIds))
    .orderBy(asc(entityFacts.id));

  const aliasesByEntity = new Map<number, string[]>();
  for (const row of aliasRows) {
    const list = aliasesByEntity.get(row.entityId) ?? [];
    list.push(row.alias);
    aliasesByEntity.set(row.entityId, list);
  }

  const factsByEntity = new Map<number, Record<string, string>>();
  const factSourcesByEntity = new Map<number, Record<string, string>>();
  for (const row of factRows) {
    const facts = factsByEntity.get(row.entityId) ?? {};
    const sources = factSourcesByEntity.get(row.entityId) ?? {};
    facts[row.key] = row.value;
    sources[row.key] = row.source;
    factsByEntity.set(row.entityId, facts);
    factSourcesByEntity.set(row.entityId, sources);
  }

  return entityRows.map((row) => ({
    id: row.id,
    type: row.type as EntityType,
    name: row.name,
    suppressedAt: row.suppressedAt,
    mergedIntoEntityId: row.mergedIntoEntityId,
    playerId: row.playerId,
    lastSeenSessionId: row.lastSeenSessionId,
    aliases: aliasesByEntity.get(row.id) ?? [],
    facts: factsByEntity.get(row.id) ?? {},
    factSources: factSourcesByEntity.get(row.id) ?? {},
  }));
}
