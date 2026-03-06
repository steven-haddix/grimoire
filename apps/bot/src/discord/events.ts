import { type Client, Events } from "discord.js";
import type { BotApi } from "../api/bot-api";
import type { CommandRouter } from "./commands";

const INITIAL_SYNC_BASE_DELAY_MS = 5_000;
const INITIAL_SYNC_MAX_DELAY_MS = 5 * 60_000;

function getInitialSyncDelayMs(attempt: number) {
  return Math.min(
    INITIAL_SYNC_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    INITIAL_SYNC_MAX_DELAY_MS,
  );
}

export function registerDiscordEvents(params: {
  client: Client;
  api: BotApi;
  commands: CommandRouter;
}) {
  const { client, api, commands } = params;

  const syncGuildPresence = async (attempt = 1): Promise<void> => {
    const guilds = [...client.guilds.cache.values()].map((guild) => ({
      guildId: guild.id,
      name: guild.name,
      icon: guild.icon ?? null,
    }));

    try {
      await api.syncGuildPresence(guilds);
      if (attempt > 1) {
        console.log(`Guild presence sync succeeded on retry ${attempt}.`);
      }
    } catch (error) {
      const delayMs = getInitialSyncDelayMs(attempt);
      console.error(
        `Guild presence sync failed on attempt ${attempt}; retrying in ${Math.round(delayMs / 1000)}s`,
        error,
      );
      setTimeout(() => {
        void syncGuildPresence(attempt + 1);
      }, delayMs);
    }
  };

  client.once(Events.ClientReady, async () => {
    console.log("🐲 DND Scribe bot online");
    void syncGuildPresence();
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
    try {
      console.log(`Message from ${msg.author.username}: ${msg.content}`);
      await commands.handleMessage(msg);
    } catch (error) {
      console.error("Message handling failed", error);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await commands.handleInteraction(interaction);
    } catch (error) {
      console.error("Interaction handling failed", error);
    }
  });
}
