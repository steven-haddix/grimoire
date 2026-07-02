import { inArray } from "drizzle-orm";
import { db } from "@/db";
import type { EntityType } from "@/db/schema";
import { players, sessions } from "@/db/schema";
import { loadCampaignGraph } from "./graph";

const DEFAULT_LIMIT = 8;

export type EntityLookupResult = {
  id: number;
  type: EntityType;
  name: string;
  aliases: string[];
  /** Latest value per fact key (status, last_known_location, …). */
  facts: Record<string, string>;
  /** Display name of the player who plays this PC, if assigned. */
  playedBy: string | null;
  lastSeen: { sessionId: number; date: string | null } | null;
};

/**
 * Read-only entity lookup for the Discord agent (and anything else that wants
 * profiles instead of raw search chunks). Matches name/aliases by
 * case-insensitive substring; never returns suppressed or merged-away
 * entities.
 */
export async function lookupEntities(params: {
  campaignId: number;
  query?: string;
  type?: EntityType;
  limit?: number;
}): Promise<EntityLookupResult[]> {
  const limit = params.limit ?? DEFAULT_LIMIT;
  const graph = await loadCampaignGraph(params.campaignId);

  let matches = graph.filter(
    (e) => !e.suppressedAt && e.mergedIntoEntityId == null,
  );
  if (params.type) {
    matches = matches.filter((e) => e.type === params.type);
  }

  const query = params.query?.trim().toLowerCase();
  if (query) {
    matches = matches.filter((e) =>
      [e.name, ...e.aliases].some((name) => {
        const candidate = name.toLowerCase();
        return candidate.includes(query) || query.includes(candidate);
      }),
    );
  }

  matches = matches.slice(0, limit);
  if (!matches.length) return [];

  // Enrich with player names and last-seen session dates.
  const playerIds = [
    ...new Set(
      matches.map((e) => e.playerId).filter((id): id is number => id != null),
    ),
  ];
  const playerRows = playerIds.length
    ? await db
        .select({ id: players.id, displayName: players.displayName })
        .from(players)
        .where(inArray(players.id, playerIds))
    : [];
  const playerNames = new Map(playerRows.map((p) => [p.id, p.displayName]));

  const sessionIds = [
    ...new Set(
      matches
        .map((e) => e.lastSeenSessionId)
        .filter((id): id is number => id != null),
    ),
  ];
  const sessionRows = sessionIds.length
    ? await db
        .select({ id: sessions.id, startedAt: sessions.startedAt })
        .from(sessions)
        .where(inArray(sessions.id, sessionIds))
    : [];
  const sessionDates = new Map(
    sessionRows.map((s) => [s.id, s.startedAt?.toISOString() ?? null]),
  );

  return matches.map((entity) => ({
    id: entity.id,
    type: entity.type,
    name: entity.name,
    aliases: entity.aliases,
    facts: entity.facts,
    playedBy:
      entity.playerId != null
        ? (playerNames.get(entity.playerId) ?? null)
        : null,
    lastSeen:
      entity.lastSeenSessionId != null
        ? {
            sessionId: entity.lastSeenSessionId,
            date: sessionDates.get(entity.lastSeenSessionId) ?? null,
          }
        : null,
  }));
}
