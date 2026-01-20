import { REST, Routes, SlashCommandBuilder } from "discord.js";
import type { BotConfig } from "../config";

export function buildCommands() {
  return [
    new SlashCommandBuilder()
      .setName("scribe")
      .setDescription("Transcribe sessions and control playback")
      .addSubcommand((sub) =>
        sub
          .setName("start")
          .setDescription("Start transcribing the current voice channel"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("stop")
          .setDescription("Stop transcribing and summarize the session"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("recap")
          .setDescription("Generate and speak a recap of the last session"),
      )
      .addSubcommand((sub) =>
        sub
          .setName("say")
          .setDescription("Speak a message in the current voice channel")
          .addStringOption((opt) =>
            opt
              .setName("text")
              .setDescription("Text to speak")
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName("voice")
              .setDescription("Optional voice id for the TTS provider")
              .setRequired(false),
          ),
      ),
    new SlashCommandBuilder()
      .setName("campaign")
      .setDescription("Manage campaign scopes")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create a new campaign")
          .addStringOption((opt) =>
            opt
              .setName("name")
              .setDescription("Campaign name")
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName("description").setDescription("Campaign description"),
          ),
      )
      .addSubcommand((sub) => sub.setName("list").setDescription("List campaigns"))
      .addSubcommand((sub) =>
        sub
          .setName("select")
          .setDescription("Select active campaign")
          .addStringOption((opt) =>
            opt
              .setName("name")
              .setDescription("Campaign name")
              .setRequired(true),
          ),
      ),
  ].map((command) => command.toJSON());
}

export async function registerSlashCommands(config: BotConfig) {
  if (!config.discordAppId) {
    console.warn("DISCORD_APP_ID not set; skipping slash command registration.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordAppId), {
    body: buildCommands(),
  });
}
