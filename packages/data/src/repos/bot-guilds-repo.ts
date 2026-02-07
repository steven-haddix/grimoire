import { eq } from "drizzle-orm";
import type { RuntimeDb } from "../client";
import { botGuilds } from "../schema-runtime";
import type { GuildPresence } from "../types";

export async function upsertGuildPresence(db: RuntimeDb, guild: GuildPresence) {
  const now = new Date();

  await db
    .insert(botGuilds)
    .values({
      guildId: guild.guildId,
      name: guild.name,
      icon: guild.icon,
      installed: true,
      installedAt: now,
      removedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: botGuilds.guildId,
      set: {
        name: guild.name,
        icon: guild.icon,
        installed: true,
        removedAt: null,
        updatedAt: now,
      },
    });
}

export async function markGuildRemoved(db: RuntimeDb, guildId: string) {
  const now = new Date();

  await db
    .update(botGuilds)
    .set({
      installed: false,
      removedAt: now,
      updatedAt: now,
    })
    .where(eq(botGuilds.guildId, guildId));
}

export async function syncGuildPresence(
  db: RuntimeDb,
  guilds: GuildPresence[],
) {
  const now = new Date();

  await db.update(botGuilds).set({
    installed: false,
    removedAt: now,
    updatedAt: now,
  });

  for (const guild of guilds) {
    await upsertGuildPresence(db, guild);
  }
}
