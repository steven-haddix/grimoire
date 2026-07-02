import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { entities, searchableChunks } from "@/db/schema";
import { embeddingMeta, embedTexts } from "@/lib/search/embeddings";
import { loadCampaignGraph } from "./graph";
import type { GraphEntity } from "./types";

/**
 * (Re)build the search-index chunk for the given entities: one "profile card"
 * per live entity so hybrid search can answer "where was Thaldrin last seen?"
 * from structured facts rather than raw transcript recall. Suppressed and
 * merged-away entities get their chunks removed. Idempotent, keyed by
 * entityId. Best-effort: never throws.
 */
export async function indexEntities(
  campaignId: number,
  entityIds: number[],
): Promise<void> {
  try {
    if (!entityIds.length) return;

    const graph = await loadCampaignGraph(campaignId);
    const wanted = new Set(entityIds);
    const targets = graph.filter((e) => wanted.has(e.id));

    const live = targets.filter(
      (e) => !e.suppressedAt && e.mergedIntoEntityId == null,
    );
    const contents = live.map(buildEntityProfile);

    // Embed before touching the index (same rationale as indexSession: a
    // failed embedding must not wipe existing chunks).
    const embeddings = contents.length ? await embedTexts(contents) : [];

    await db.transaction(async (tx) => {
      await tx
        .delete(searchableChunks)
        .where(
          and(
            eq(searchableChunks.sourceType, "entity"),
            inArray(searchableChunks.sourceId, entityIds),
          ),
        );

      if (live.length) {
        await tx.insert(searchableChunks).values(
          live.map((entity, index) => {
            const embedding = embeddings[index] ?? null;
            return {
              campaignId,
              sessionId: null,
              sourceType: "entity" as const,
              sourceId: entity.id,
              chunkIndex: 0,
              speaker: null,
              content: contents[index] ?? "",
              embedding,
              ...embeddingMeta(embedding),
            };
          }),
        );
      }
    });
  } catch (error) {
    console.error("indexEntities failed", { campaignId, entityIds, error });
  }
}

/** Re-index every entity in a campaign (used by merge/suppress actions). */
export async function indexAllEntities(campaignId: number): Promise<void> {
  try {
    const rows = await db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.campaignId, campaignId));
    await indexEntities(
      campaignId,
      rows.map((r) => r.id),
    );
  } catch (error) {
    console.error("indexAllEntities failed", { campaignId, error });
  }
}

/**
 * Compose the searchable "profile card" text for one entity from its latest
 * facts. Plain prose-ish lines embed well and read fine when surfaced raw.
 */
export function buildEntityProfile(entity: GraphEntity): string {
  const lines: string[] = [];
  const aliasSuffix = entity.aliases.length
    ? ` (also known as: ${entity.aliases.join(", ")})`
    : "";
  lines.push(`${labelFor(entity.type)}: ${entity.name}${aliasSuffix}`);
  for (const [key, value] of Object.entries(entity.facts)) {
    lines.push(`${key.replaceAll("_", " ")}: ${value}`);
  }
  return lines.join("\n");
}

function labelFor(type: GraphEntity["type"]): string {
  switch (type) {
    case "pc":
      return "Player character";
    case "npc":
      return "NPC";
    case "faction":
      return "Faction";
    case "location":
      return "Location";
  }
}
