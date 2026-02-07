import { describe, expect, test } from "bun:test";
import type { RuntimeDb } from "@grimoire/data/client";
import { createGuildPresenceServiceWithDeps } from "./guild-presence-service";

const noopDb = {} as RuntimeDb;

describe("createGuildPresenceService", () => {
  test("delegates guild sync/upsert/remove to repository functions", async () => {
    const calls: string[] = [];

    const service = createGuildPresenceServiceWithDeps({
      db: noopDb,
      syncGuildPresenceFn: async (_db, guilds) => {
        calls.push(`sync:${guilds.length}`);
      },
      upsertGuildPresenceFn: async (_db, guild) => {
        calls.push(`upsert:${guild.guildId}`);
      },
      markGuildRemovedFn: async (_db, guildId) => {
        calls.push(`remove:${guildId}`);
      },
    });

    await service.sync([
      { guildId: "g1", name: "Guild 1", icon: null },
      { guildId: "g2", name: "Guild 2", icon: null },
    ]);
    await service.upsert({ guildId: "g3", name: "Guild 3", icon: null });
    await service.markRemoved("g4");

    expect(calls).toEqual(["sync:2", "upsert:g3", "remove:g4"]);
  });
});
