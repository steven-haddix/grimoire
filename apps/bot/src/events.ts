import { type Client, Events } from "discord.js";
import type { BotApi } from "./api";
import type { CommandRouter } from "./commands";

export function registerDiscordEvents(params: {
  client: Client;
  api: BotApi;
  commands: CommandRouter;
}) {
  const { client, api, commands } = params;

  client.once(Events.ClientReady, async () => {
    console.log("🐲 DND Scribe bot online");
    try {
      const guilds = [...client.guilds.cache.values()].map((guild) => ({
        guildId: guild.id,
        name: guild.name,
        icon: guild.icon ?? null,
      }));
      await api.syncGuildPresence(guilds);
    } catch (error) {
      console.error("Guild presence sync failed", error);
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    try {
      await api.upsertGuildPresence({
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
      await api.markGuildRemoved(guild.id);
    } catch (error) {
      console.error("Guild presence removal failed", error);
    }
  });

  client.on(Events.GuildUpdate, async (_oldGuild, newGuild) => {
    try {
      await api.upsertGuildPresence({
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
}
