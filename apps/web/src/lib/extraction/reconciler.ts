import type {
  EntityObservation,
  EntityUpdatePlan,
  GraphEntity,
  NewEntityPlan,
  PlannedFact,
  ReconcilePlan,
  SkippedObservation,
} from "./types";

/**
 * Deterministic reconciler: turns LLM entity observations into a concrete
 * write plan against the current graph. The model owns identity *judgment*
 * (it proposes `matchedEntityId` from the candidate list it was shown); this
 * function owns the invariants the model can't be trusted with:
 *
 * - hallucinated entity ids are never written to (fall back to exact
 *   name/alias matching, then to creation)
 * - merge redirects are followed so writes land on the surviving entity
 * - suppressed (tombstoned) entities are never written to or recreated
 * - facts identical to the current value are dropped (no noise revisions)
 * - already-known aliases are not re-added
 *
 * Pure function: no DB access, fully unit-tested. The orchestrator executes
 * the returned plan.
 */
export function reconcile(
  graph: GraphEntity[],
  observations: EntityObservation[],
): ReconcilePlan {
  const byId = new Map<number, GraphEntity>(graph.map((e) => [e.id, e]));

  // Exact (case-insensitive) name/alias → entity lookup. Deliberately exact:
  // fuzzy identity judgments belong to the model, not string similarity.
  const nameIndex = new Map<string, GraphEntity>();
  for (const e of graph) {
    for (const name of [e.name, ...e.aliases]) {
      const key = normalize(name);
      if (key && !nameIndex.has(key)) nameIndex.set(key, e);
    }
  }

  const updates = new Map<number, EntityUpdatePlan>();
  const creations = new Map<string, NewEntityPlan>();
  const skipped: SkippedObservation[] = [];

  for (const observation of observations) {
    const name = observation.name.trim();
    if (!name) continue;

    const resolved = resolveTarget(observation, byId, nameIndex);

    if (resolved.kind === "suppressed") {
      skipped.push({ name, reason: "suppressed" });
      continue;
    }

    if (resolved.kind === "existing") {
      applyToExisting(updates, resolved.entity, observation, name);
      continue;
    }

    applyToNew(creations, observation, name);
  }

  return {
    // A pending creation is registered under every name it's known by, so
    // dedupe the plan objects themselves.
    newEntities: [...new Set(creations.values())],
    entityUpdates: [...updates.values()],
    skipped,
  };
}

type ResolvedTarget =
  | { kind: "existing"; entity: GraphEntity }
  | { kind: "new" }
  | { kind: "suppressed" };

function resolveTarget(
  observation: EntityObservation,
  byId: Map<number, GraphEntity>,
  nameIndex: Map<string, GraphEntity>,
): ResolvedTarget {
  // 1. The model's explicit match, if the id actually exists.
  const idMatch =
    observation.matchedEntityId != null
      ? byId.get(observation.matchedEntityId)
      : undefined;

  // 2. Safety net for absent/hallucinated ids: exact name or alias match on
  //    any of the names this observation carries.
  const nameMatch = idMatch ? undefined : findByNames(observation, nameIndex);

  const match = idMatch ?? nameMatch;
  if (!match) return { kind: "new" };

  const target = followMergeRedirects(match, byId);
  if (target.suppressedAt) return { kind: "suppressed" };
  return { kind: "existing", entity: target };
}

function findByNames(
  observation: EntityObservation,
  nameIndex: Map<string, GraphEntity>,
): GraphEntity | undefined {
  for (const raw of [observation.name, ...(observation.aliases ?? [])]) {
    const found = nameIndex.get(normalize(raw));
    if (found) return found;
  }
  return undefined;
}

/** Follow merge redirects to the surviving entity; cycle-safe. */
function followMergeRedirects(
  entity: GraphEntity,
  byId: Map<number, GraphEntity>,
): GraphEntity {
  let current = entity;
  const visited = new Set<number>([current.id]);
  while (current.mergedIntoEntityId != null) {
    const next = byId.get(current.mergedIntoEntityId);
    if (!next || visited.has(next.id)) break;
    visited.add(next.id);
    current = next;
  }
  return current;
}

function applyToExisting(
  updates: Map<number, EntityUpdatePlan>,
  entity: GraphEntity,
  observation: EntityObservation,
  observedName: string,
): void {
  const update = updates.get(entity.id) ?? {
    entityId: entity.id,
    newAliases: [],
    newFacts: [],
    markSeen: false,
  };

  const knownAliases = new Set(
    [entity.name, ...entity.aliases, ...update.newAliases].map(normalize),
  );

  // The name the model heard this session counts as an alias candidate too —
  // that's how ASR variants accumulate onto the canonical entity.
  for (const raw of [observedName, ...(observation.aliases ?? [])]) {
    const alias = raw.trim();
    const key = normalize(alias);
    if (!key || knownAliases.has(key)) continue;
    knownAliases.add(key);
    update.newAliases.push(alias);
  }

  const plannedKeys = new Set(update.newFacts.map((f) => f.key));
  for (const fact of cleanFacts(observation)) {
    // Drop no-op revisions: the graph already holds this exact value.
    if (entity.facts[fact.key]?.trim() === fact.value) continue;
    if (plannedKeys.has(fact.key)) continue;
    plannedKeys.add(fact.key);
    update.newFacts.push(fact);
  }

  update.markSeen = update.markSeen || observation.appearedInSession === true;
  updates.set(entity.id, update);
}

function applyToNew(
  creations: Map<string, NewEntityPlan>,
  observation: EntityObservation,
  name: string,
): void {
  // Two observations of the same unknown entity in one run (or an alias of a
  // pending creation) collapse into a single new entity.
  const existingKey = [name, ...(observation.aliases ?? [])]
    .map(normalize)
    .find((key) => creations.has(key));

  const planned: NewEntityPlan = existingKey
    ? // biome-ignore lint/style/noNonNullAssertion: existence checked above
      creations.get(existingKey)!
    : {
        type: observation.type,
        name,
        aliases: [],
        facts: [],
        appearedInSession: false,
      };

  const knownAliases = new Set(
    [planned.name, ...planned.aliases].map(normalize),
  );
  for (const raw of [name, ...(observation.aliases ?? [])]) {
    const alias = raw.trim();
    const key = normalize(alias);
    if (!key || knownAliases.has(key)) continue;
    knownAliases.add(key);
    planned.aliases.push(alias);
  }

  const plannedKeys = new Set(planned.facts.map((f) => f.key));
  for (const fact of cleanFacts(observation)) {
    if (plannedKeys.has(fact.key)) continue;
    plannedKeys.add(fact.key);
    planned.facts.push(fact);
  }

  planned.appearedInSession =
    planned.appearedInSession || observation.appearedInSession === true;

  // Register the creation under every name it's known by, so later
  // observations using any variant collapse into it.
  for (const key of knownAliases) {
    if (!creations.has(key)) creations.set(key, planned);
  }
}

function cleanFacts(observation: EntityObservation): PlannedFact[] {
  const facts: PlannedFact[] = [];
  for (const fact of observation.facts ?? []) {
    const key = fact.key.trim();
    const value = fact.value.trim();
    if (!key || !value) continue;
    facts.push({ key, value, confidence: fact.confidence ?? null });
  }
  return facts;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
