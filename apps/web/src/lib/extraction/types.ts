import type { EntityType } from "@/db/schema";

/**
 * Snapshot of one entity as the reconciler sees it: identity plus the latest
 * value of every fact key. Loaded from the DB by the orchestrator; kept as a
 * plain object so the reconciler stays a pure, unit-testable function.
 */
export type GraphEntity = {
  id: number;
  type: EntityType;
  name: string;
  suppressedAt: Date | null;
  mergedIntoEntityId: number | null;
  aliases: string[];
  /** Latest value per fact key. */
  facts: Record<string, string>;
  /**
   * Source of the latest fact per key ("dm" facts get flagged in the
   * extraction prompt so the model doesn't casually override human edits).
   * Optional — the reconciler doesn't use it.
   */
  factSources?: Record<string, string>;
  /** For PCs: the player row this character is assigned to. Optional — the reconciler doesn't use it. */
  playerId?: number | null;
  /** Session the entity was last seen in. Optional — the reconciler doesn't use it. */
  lastSeenSessionId?: number | null;
};

export type ObservedFact = {
  key: string;
  value: string;
  /** Extractor confidence in [0, 1]. */
  confidence?: number | null;
};

/**
 * One entity the LLM saw in a session. The model makes the identity judgment
 * (`matchedEntityId` against the candidate list it was shown); the reconciler
 * only validates and applies it.
 */
export type EntityObservation = {
  /** Canonical name as the model heard it this session. */
  name: string;
  type: EntityType;
  /** Candidate-list id the model matched, if any. */
  matchedEntityId?: number | null;
  /** Alternate names/spellings heard this session (may include ASR variants). */
  aliases?: string[];
  facts?: ObservedFact[];
  /** True if the entity was present/active, not merely mentioned. */
  appearedInSession?: boolean;
};

export type PlannedFact = {
  key: string;
  value: string;
  confidence: number | null;
};

export type NewEntityPlan = {
  type: EntityType;
  name: string;
  aliases: string[];
  facts: PlannedFact[];
  appearedInSession: boolean;
};

export type EntityUpdatePlan = {
  entityId: number;
  newAliases: string[];
  newFacts: PlannedFact[];
  markSeen: boolean;
};

export type SkippedObservation = {
  name: string;
  reason: "suppressed";
};

/**
 * Pure description of the DB writes a set of observations implies. The
 * orchestrator executes it; nothing here has touched the database.
 */
export type ReconcilePlan = {
  newEntities: NewEntityPlan[];
  entityUpdates: EntityUpdatePlan[];
  skipped: SkippedObservation[];
};
