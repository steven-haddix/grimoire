import type { RuntimeDb } from "@grimoire/data/client";
import {
  markGuildRemoved,
  syncGuildPresence,
  upsertGuildPresence,
} from "@grimoire/data/repos/bot-guilds";
import type { GuildPresence } from "@grimoire/data/types";

export function createGuildPresenceService(db: RuntimeDb) {
  return createGuildPresenceServiceWithDeps({
    db,
    syncGuildPresenceFn: syncGuildPresence,
    upsertGuildPresenceFn: upsertGuildPresence,
    markGuildRemovedFn: markGuildRemoved,
  });
}

export function createGuildPresenceServiceWithDeps(params: {
  db: RuntimeDb;
  syncGuildPresenceFn?: typeof syncGuildPresence;
  upsertGuildPresenceFn?: typeof upsertGuildPresence;
  markGuildRemovedFn?: typeof markGuildRemoved;
}) {
  const {
    db,
    syncGuildPresenceFn = syncGuildPresence,
    upsertGuildPresenceFn = upsertGuildPresence,
    markGuildRemovedFn = markGuildRemoved,
  } = params;

  return {
    sync: async (guilds: GuildPresence[]) => {
      await syncGuildPresenceFn(db, guilds);
    },
    upsert: async (guild: GuildPresence) => {
      await upsertGuildPresenceFn(db, guild);
    },
    markRemoved: async (guildId: string) => {
      await markGuildRemovedFn(db, guildId);
    },
  };
}
