import { describe, expect, test } from "bun:test";
import { reconcile } from "./reconciler";
import type { EntityObservation, GraphEntity } from "./types";

function entity(overrides: Partial<GraphEntity> & { id: number }): GraphEntity {
  return {
    type: "npc",
    name: `Entity ${overrides.id}`,
    suppressedAt: null,
    mergedIntoEntityId: null,
    aliases: [],
    facts: {},
    ...overrides,
  };
}

describe("reconcile", () => {
  test("creates a new entity when nothing matches", () => {
    const observations: EntityObservation[] = [
      {
        name: "Gorbag",
        type: "npc",
        aliases: ["the orc chieftain"],
        facts: [
          {
            key: "description",
            value: "Orc chieftain of the Red Fang",
            confidence: 0.9,
          },
          {
            key: "last_known_location",
            value: "Thornwood camp",
            confidence: 0.8,
          },
        ],
        appearedInSession: true,
      },
    ];

    const plan = reconcile([], observations);

    expect(plan.entityUpdates).toHaveLength(0);
    expect(plan.skipped).toHaveLength(0);
    expect(plan.newEntities).toHaveLength(1);
    expect(plan.newEntities[0]).toEqual({
      type: "npc",
      name: "Gorbag",
      aliases: ["the orc chieftain"],
      facts: [
        {
          key: "description",
          value: "Orc chieftain of the Red Fang",
          confidence: 0.9,
        },
        {
          key: "last_known_location",
          value: "Thornwood camp",
          confidence: 0.8,
        },
      ],
      appearedInSession: true,
    });
  });

  test("matched entity gets new facts and aliases and is marked seen", () => {
    const graph = [
      entity({
        id: 42,
        name: "Thaldrin",
        type: "pc",
        aliases: ["Thal"],
        facts: { status: "alive" },
      }),
    ];
    const observations: EntityObservation[] = [
      {
        name: "Thaldrin",
        type: "pc",
        matchedEntityId: 42,
        aliases: ["Thal Drin"],
        facts: [
          {
            key: "last_known_location",
            value: "Neverwinter",
            confidence: 0.85,
          },
        ],
        appearedInSession: true,
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.newEntities).toHaveLength(0);
    expect(plan.entityUpdates).toEqual([
      {
        entityId: 42,
        newAliases: ["Thal Drin"],
        newFacts: [
          {
            key: "last_known_location",
            value: "Neverwinter",
            confidence: 0.85,
          },
        ],
        markSeen: true,
      },
    ]);
  });

  test("follows merge redirects so writes land on the surviving entity", () => {
    const graph = [
      entity({ id: 7, name: "The Hooded Stranger", mergedIntoEntityId: 9 }),
      entity({ id: 9, name: "Varis", aliases: ["The Hooded Stranger"] }),
    ];
    const observations: EntityObservation[] = [
      {
        name: "The Hooded Stranger",
        type: "npc",
        matchedEntityId: 7,
        facts: [{ key: "status", value: "hostile", confidence: 0.7 }],
        appearedInSession: true,
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.newEntities).toHaveLength(0);
    expect(plan.entityUpdates).toHaveLength(1);
    expect(plan.entityUpdates[0]?.entityId).toBe(9);
  });

  test("refuses to write to a suppressed entity matched by id", () => {
    const graph = [
      entity({ id: 5, name: "Fake NPC", suppressedAt: new Date() }),
    ];
    const observations: EntityObservation[] = [
      {
        name: "Fake NPC",
        type: "npc",
        matchedEntityId: 5,
        facts: [{ key: "status", value: "alive" }],
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.newEntities).toHaveLength(0);
    expect(plan.entityUpdates).toHaveLength(0);
    expect(plan.skipped).toEqual([{ name: "Fake NPC", reason: "suppressed" }]);
  });

  test("refuses to recreate a suppressed entity by name", () => {
    const graph = [
      entity({
        id: 5,
        name: "Gorbag",
        aliases: ["the orc chieftain"],
        suppressedAt: new Date(),
      }),
    ];
    const observations: EntityObservation[] = [
      {
        name: "the Orc Chieftain",
        type: "npc",
        facts: [{ key: "status", value: "alive" }],
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.newEntities).toHaveLength(0);
    expect(plan.entityUpdates).toHaveLength(0);
    expect(plan.skipped).toEqual([
      { name: "the Orc Chieftain", reason: "suppressed" },
    ]);
  });

  test("hallucinated matchedEntityId falls back to name matching", () => {
    const graph = [
      entity({ id: 3, name: "Varis", aliases: ["The Hooded Stranger"] }),
    ];
    const observations: EntityObservation[] = [
      {
        name: "varis",
        type: "npc",
        matchedEntityId: 9999,
        facts: [{ key: "status", value: "wounded", confidence: 0.6 }],
        appearedInSession: true,
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.newEntities).toHaveLength(0);
    expect(plan.entityUpdates).toHaveLength(1);
    expect(plan.entityUpdates[0]?.entityId).toBe(3);
  });

  test("hallucinated id with an unknown name creates a new entity", () => {
    const observations: EntityObservation[] = [
      {
        name: "Mysterious Pedlar",
        type: "npc",
        matchedEntityId: 9999,
        facts: [{ key: "description", value: "Sells cursed trinkets" }],
        appearedInSession: true,
      },
    ];

    const plan = reconcile([], observations);

    expect(plan.entityUpdates).toHaveLength(0);
    expect(plan.newEntities).toHaveLength(1);
    expect(plan.newEntities[0]?.name).toBe("Mysterious Pedlar");
  });

  test("skips facts whose value matches the current graph value", () => {
    const graph = [
      entity({
        id: 42,
        name: "Thaldrin",
        facts: { status: "alive", last_known_location: "Neverwinter" },
      }),
    ];
    const observations: EntityObservation[] = [
      {
        name: "Thaldrin",
        type: "npc",
        matchedEntityId: 42,
        facts: [
          { key: "status", value: "alive" },
          { key: "last_known_location", value: "  Neverwinter " },
          { key: "goal", value: "find the amulet", confidence: 0.9 },
        ],
        appearedInSession: true,
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.entityUpdates).toHaveLength(1);
    expect(plan.entityUpdates[0]?.newFacts).toEqual([
      { key: "goal", value: "find the amulet", confidence: 0.9 },
    ]);
  });

  test("does not re-add aliases the entity already has (case-insensitive)", () => {
    const graph = [entity({ id: 42, name: "Thaldrin", aliases: ["Thal"] })];
    const observations: EntityObservation[] = [
      {
        name: "Thaldrin",
        type: "npc",
        matchedEntityId: 42,
        aliases: ["thal", "THALDRIN", "Thal the Wise"],
        appearedInSession: false,
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.entityUpdates).toHaveLength(1);
    expect(plan.entityUpdates[0]?.newAliases).toEqual(["Thal the Wise"]);
    expect(plan.entityUpdates[0]?.markSeen).toBe(false);
  });

  test("observed name differing from canonical name becomes an alias", () => {
    const graph = [entity({ id: 42, name: "Thaldrin" })];
    const observations: EntityObservation[] = [
      {
        name: "Thal Drin",
        type: "npc",
        matchedEntityId: 42,
        appearedInSession: true,
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.entityUpdates[0]?.newAliases).toEqual(["Thal Drin"]);
  });

  test("merges multiple observations that resolve to the same entity", () => {
    const graph = [entity({ id: 42, name: "Thaldrin", aliases: ["Thal"] })];
    const observations: EntityObservation[] = [
      {
        name: "Thaldrin",
        type: "npc",
        matchedEntityId: 42,
        facts: [{ key: "status", value: "wounded", confidence: 0.8 }],
        appearedInSession: false,
      },
      {
        name: "Thal",
        type: "npc",
        facts: [{ key: "goal", value: "revenge", confidence: 0.7 }],
        appearedInSession: true,
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.entityUpdates).toHaveLength(1);
    expect(plan.entityUpdates[0]?.entityId).toBe(42);
    expect(plan.entityUpdates[0]?.newFacts).toEqual([
      { key: "status", value: "wounded", confidence: 0.8 },
      { key: "goal", value: "revenge", confidence: 0.7 },
    ]);
    expect(plan.entityUpdates[0]?.markSeen).toBe(true);
  });

  test("merges duplicate new-entity observations within one run", () => {
    const observations: EntityObservation[] = [
      {
        name: "Gorbag",
        type: "npc",
        facts: [{ key: "description", value: "Orc chieftain" }],
        appearedInSession: true,
      },
      {
        name: "gorbag",
        type: "npc",
        aliases: ["the chieftain"],
        facts: [{ key: "status", value: "hostile" }],
        appearedInSession: false,
      },
    ];

    const plan = reconcile([], observations);

    expect(plan.newEntities).toHaveLength(1);
    expect(plan.newEntities[0]?.name).toBe("Gorbag");
    expect(plan.newEntities[0]?.aliases).toEqual(["the chieftain"]);
    expect(plan.newEntities[0]?.facts).toEqual([
      { key: "description", value: "Orc chieftain", confidence: null },
      { key: "status", value: "hostile", confidence: null },
    ]);
    expect(plan.newEntities[0]?.appearedInSession).toBe(true);
  });

  test("new-entity observation matching an existing name updates instead of duplicating", () => {
    const graph = [
      entity({ id: 42, name: "Thaldrin", aliases: ["Thal Drin"] }),
    ];
    const observations: EntityObservation[] = [
      {
        name: "Thal Drin",
        type: "npc",
        facts: [{ key: "status", value: "alive", confidence: 0.9 }],
        appearedInSession: true,
      },
    ];

    const plan = reconcile(graph, observations);

    expect(plan.newEntities).toHaveLength(0);
    expect(plan.entityUpdates).toHaveLength(1);
    expect(plan.entityUpdates[0]?.entityId).toBe(42);
  });

  test("drops facts and aliases that are empty after trimming", () => {
    const observations: EntityObservation[] = [
      {
        name: "Gorbag",
        type: "npc",
        aliases: ["  ", "the chieftain"],
        facts: [
          { key: "status", value: "   " },
          { key: "", value: "orphan value" },
          { key: "goal", value: "conquest" },
        ],
        appearedInSession: true,
      },
    ];

    const plan = reconcile([], observations);

    expect(plan.newEntities[0]?.aliases).toEqual(["the chieftain"]);
    expect(plan.newEntities[0]?.facts).toEqual([
      { key: "goal", value: "conquest", confidence: null },
    ]);
  });

  test("survives a merge-redirect cycle without hanging", () => {
    const graph = [
      entity({ id: 1, name: "A", mergedIntoEntityId: 2 }),
      entity({ id: 2, name: "B", mergedIntoEntityId: 1 }),
    ];
    const observations: EntityObservation[] = [
      {
        name: "A",
        type: "npc",
        matchedEntityId: 1,
        facts: [{ key: "status", value: "alive" }],
        appearedInSession: true,
      },
    ];

    const plan = reconcile(graph, observations);

    // Cycle resolution lands on the last entity before the loop repeats.
    expect(plan.entityUpdates).toHaveLength(1);
    expect([1, 2]).toContain(plan.entityUpdates[0]?.entityId ?? -1);
  });
});
