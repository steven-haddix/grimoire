import { describe, expect, test } from "bun:test";
import { selectCandidates } from "./candidates";
import type { GraphEntity } from "./types";

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

const ids = (candidates: GraphEntity[]) => candidates.map((c) => c.id);

describe("selectCandidates", () => {
  test("always includes PCs even when not mentioned", () => {
    const entities = [
      entity({ id: 1, type: "pc", name: "Thaldrin" }),
      entity({ id: 2, type: "npc", name: "Gorbag" }),
    ];

    const candidates = selectCandidates(entities, "the party rested at camp");

    expect(ids(candidates)).toEqual([1]);
  });

  test("includes entities whose name appears in the text", () => {
    const entities = [
      entity({ id: 2, type: "npc", name: "Gorbag" }),
      entity({ id: 3, type: "npc", name: "Varis" }),
    ];

    const candidates = selectCandidates(
      entities,
      "They confronted Gorbag at the gate.",
    );

    expect(ids(candidates)).toEqual([2]);
  });

  test("matches via alias, case-insensitively", () => {
    const entities = [
      entity({
        id: 3,
        type: "npc",
        name: "Varis",
        aliases: ["The Hooded Stranger"],
      }),
    ];

    const candidates = selectCandidates(
      entities,
      "the HOODED STRANGER appeared again",
    );

    expect(ids(candidates)).toEqual([3]);
  });

  test("does not match name fragments inside other words", () => {
    const entities = [entity({ id: 4, type: "npc", name: "Bob" })];

    const candidates = selectCandidates(
      entities,
      "the boat was bobbing in the water",
    );

    expect(candidates).toHaveLength(0);
  });

  test("excludes suppressed and merged-away entities", () => {
    const entities = [
      entity({ id: 5, type: "npc", name: "Gorbag", suppressedAt: new Date() }),
      entity({ id: 6, type: "npc", name: "Varis", mergedIntoEntityId: 7 }),
      entity({
        id: 7,
        type: "npc",
        name: "The Real Varis",
        aliases: ["Varis"],
      }),
      entity({ id: 8, type: "pc", name: "Dead PC", suppressedAt: new Date() }),
    ];

    const candidates = selectCandidates(entities, "Gorbag met Varis in town");

    expect(ids(candidates)).toEqual([7]);
  });

  test("caps results at the limit, keeping PCs first", () => {
    const entities = [
      entity({ id: 1, type: "npc", name: "Alpha" }),
      entity({ id: 2, type: "pc", name: "Bravo" }),
      entity({ id: 3, type: "npc", name: "Charlie" }),
      entity({ id: 4, type: "pc", name: "Delta" }),
    ];

    const candidates = selectCandidates(
      entities,
      "Alpha Bravo Charlie Delta all met at the tavern",
      { limit: 3 },
    );

    expect(candidates).toHaveLength(3);
    expect(ids(candidates).slice(0, 2)).toEqual([2, 4]);
  });

  test("handles names containing regex metacharacters", () => {
    const entities = [
      entity({ id: 9, type: "location", name: "The Wyrm's Rest (Inn)" }),
    ];

    const candidates = selectCandidates(
      entities,
      "they slept at the wyrm's rest (inn) overnight",
    );

    expect(ids(candidates)).toEqual([9]);
  });
});
