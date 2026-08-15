import { REST, Routes, SlashCommandBuilder } from "discord.js";
import type { BotConfig } from "../config";

export function buildGrimCommands() {
  return [
    new SlashCommandBuilder()
      .setName("grim")
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
              .setDescription(
                "Optional voice persona name (e.g. narrator, wizard)",
              )
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("scene")
          .setDescription("Generate a D&D art scene from the current session")
          .addStringOption((opt) =>
            opt
              .setName("prompt")
              .setDescription("What scene to illustrate")
              .setRequired(true),
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
      .addSubcommand((sub) =>
        sub.setName("list").setDescription("List campaigns"),
      )
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
      )
      .addSubcommandGroup((group) =>
        group
          .setName("schedule")
          .setDescription("Manage the active campaign's game reminders")
          .addSubcommand((sub) =>
            sub
              .setName("set")
              .setDescription("Schedule a weekly game reminder")
              .addIntegerOption((opt) =>
                opt
                  .setName("weekday")
                  .setDescription("Day of the week")
                  .setRequired(true)
                  .addChoices(
                    { name: "Sunday", value: 0 },
                    { name: "Monday", value: 1 },
                    { name: "Tuesday", value: 2 },
                    { name: "Wednesday", value: 3 },
                    { name: "Thursday", value: 4 },
                    { name: "Friday", value: 5 },
                    { name: "Saturday", value: 6 },
                  ),
              )
              .addStringOption((opt) =>
                opt
                  .setName("time")
                  .setDescription("Local time in 24-hour HH:mm format")
                  .setRequired(true),
              )
              .addStringOption((opt) =>
                opt
                  .setName("timezone")
                  .setDescription("Timezone, e.g. EST or America/New_York")
                  .setRequired(true),
              ),
          )
          .addSubcommand((sub) =>
            sub.setName("show").setDescription("Show the next game reminder"),
          )
          .addSubcommand((sub) =>
            sub
              .setName("remove")
              .setDescription("Remove the weekly game reminder"),
          ),
      ),
  ].map((command) => command.toJSON());
}

export async function registerSlashCommands(config: BotConfig) {
  if (!config.discordAppId) {
    console.warn(
      "DISCORD_APP_ID not set; skipping slash command registration.",
    );
    return;
  }

  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(config.discordAppId), {
    body: buildGrimCommands(),
  });
}
