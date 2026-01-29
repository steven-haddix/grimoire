import type {
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
  Message,
} from "discord.js";
import { MessageFlags } from "discord.js";
import type { BotController } from "../services/bot-controller";
import type { CommandContext, CommandIntent } from "../types";

export type CommandRouter = {
  handleInteraction: (interaction: Interaction) => Promise<void>;
  handleMessage: (msg: Message) => Promise<void>;
};

function splitMessage(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) return [text];
  const chunks = [];

  while (text.length > maxLength) {
    let splitAt = text.lastIndexOf("\n", maxLength);
    if (splitAt === -1) {
      splitAt = text.lastIndexOf(" ", maxLength);
    }
    if (splitAt === -1) {
      splitAt = maxLength;
    }

    chunks.push(text.substring(0, splitAt));
    text = text.substring(splitAt).trimStart();
  }

  if (text.length > 0) {
    chunks.push(text);
  }

  return chunks;
}

export function createCommandRouter(params: {
  controller: BotController;
}): CommandRouter {
  const { controller } = params;

  const buildMessageContext = (msg: Message<true>): CommandContext => ({
    guildId: msg.guild.id,
    channelId: msg.channel.id,
    userId: msg.author.id,
    userName: msg.author.username,
    userDisplayName: msg.member?.displayName ?? msg.author.username,
    voiceChannelId: msg.member?.voice.channel?.id ?? undefined,
    reply: async (content) => {
      const chunks = splitMessage(content);
      for (const chunk of chunks) {
        await msg.reply(chunk);
      }
    },
  });

  const buildInteractionContext = (
    interaction: ChatInputCommandInteraction,
    replyStrategy: "edit" | "followUp",
  ): CommandContext => {
    const member =
      interaction.member && "voice" in interaction.member
        ? (interaction.member as GuildMember)
        : null;

    return {
      guildId: interaction.guildId ?? "",
      channelId: interaction.channelId ?? "",
      userId: interaction.user.id,
      userName: interaction.user.username,
      userDisplayName: member?.displayName ?? interaction.user.username,
      voiceChannelId: member?.voice.channelId ?? undefined,
      reply: async (content) => {
        const chunks = splitMessage(content);

        if (replyStrategy === "edit") {
          const firstChunk = chunks[0];
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(firstChunk);
          } else {
            await interaction.reply(firstChunk);
          }

          for (let i = 1; i < chunks.length; i++) {
            await interaction.followUp({
              content: chunks[i],
            });
          }
          return;
        }

        // Strategy: followUp
        for (const chunk of chunks) {
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({
              content: chunk,
              flags: MessageFlags.Ephemeral,
            });
          } else {
            await interaction.reply({
              content: chunk,
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      },
    };
  };

  const handleInteraction = async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) return;

    let intent: CommandIntent | null = null;

    if (interaction.commandName === "grim") {
      const sub = interaction.options.getSubcommand();

      if (sub === "start") {
        intent = { type: "start" };
      } else if (sub === "stop") {
        intent = { type: "stop" };
      } else if (sub === "recap") {
        intent = { type: "recap" };
      } else if (sub === "say") {
        const text = interaction.options.getString("text", true);
        const voiceOverride =
          interaction.options.getString("voice") ?? undefined;
        intent = { type: "say", text, voiceOverride };
      }
    } else if (interaction.commandName === "campaign") {
      const sub = interaction.options.getSubcommand();

      if (sub === "create") {
        const name = interaction.options.getString("name", true);
        const description =
          interaction.options.getString("description") ?? undefined;
        intent = { type: "campaign_create", name, description };
      } else if (sub === "list") {
        intent = { type: "campaign_list" };
      } else if (sub === "select") {
        const name = interaction.options.getString("name", true);
        intent = { type: "campaign_select", name };
      }
    }

    if (!intent) return;

    if (intent.type === "say") {
      await interaction.reply({
        content: "🗣️ Speaking...",
        flags: MessageFlags.Ephemeral,
      });
      const ctx = buildInteractionContext(interaction, "followUp");
      await controller.handleIntent(intent, ctx);
      return;
    }

    await interaction.deferReply();
    const ctx = buildInteractionContext(interaction, "edit");
    await controller.handleIntent(intent, ctx);
  };

  const handleMessage = async (msg: Message) => {
    if (!msg.inGuild() || msg.author.bot) return;
    if (!msg.client.user) return;
    if (!msg.mentions.has(msg.client.user.id)) return;

    const cleaned = msg.content
      .replaceAll(`<@${msg.client.user.id}>`, "")
      .replaceAll(`<@!${msg.client.user.id}>`, "")
      .trim();

    if (!cleaned) return;

    const ctx = buildMessageContext(msg);
    const intent: CommandIntent = { type: "agent", message: cleaned };
    await controller.handleIntent(intent, ctx);
  };

  return { handleInteraction, handleMessage };
}
