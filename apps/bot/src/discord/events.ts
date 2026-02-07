import { type Client, Events } from "discord.js";
import type { CommandRouter } from "./commands";

export type GuildPresenceService = {
  sync: (
    guilds: Array<{ guildId: string; name: string; icon: string | null }>,
  ) => Promise<void>;
  upsert: (guild: {
    guildId: string;
    name: string;
    icon: string | null;
  }) => Promise<void>;
  markRemoved: (guildId: string) => Promise<void>;
};

export function registerDiscordEvents(params: {
  client: Client;
  guildPresence: GuildPresenceService;
  commands: CommandRouter;
}) {
  const { client, guildPresence, commands } = params;

  client.once(Events.ClientReady, async () => {
    console.log("🐲 DND Scribe bot online");
    try {
      const guilds = [...client.guilds.cache.values()].map((guild) => ({
        guildId: guild.id,
        name: guild.name,
        icon: guild.icon ?? null,
      }));
      await guildPresence.sync(guilds);
    } catch (error) {
      console.error("Guild presence sync failed", error);
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    try {
      await guildPresence.upsert({
        guildId: guild.id,
        name: guild.name,
        icon: guild.icon ?? null,
      });
    } catch (error) {
      console.error("Guild presence upsert failed", error);
    }
  });

  client.on(Events.GuildDelete, async (guild) => {
    try {
      await guildPresence.markRemoved(guild.id);
    } catch (error) {
      console.error("Guild presence removal failed", error);
    }
  });

  client.on(Events.GuildUpdate, async (_oldGuild, newGuild) => {
    try {
      await guildPresence.upsert({
        guildId: newGuild.id,
        name: newGuild.name,
        icon: newGuild.icon ?? null,
      });
    } catch (error) {
      console.error("Guild presence update failed", error);
    }
  });

  client.on(Events.MessageCreate, async (msg) => {
    console.log(`Message from ${msg.author.username}: ${msg.content}`);
    await commands.handleMessage(msg);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await commands.handleInteraction(interaction);
  });
}
