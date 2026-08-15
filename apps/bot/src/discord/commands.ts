import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
  Message,
} from "discord.js";
import { MessageFlags, PermissionFlagsBits } from "discord.js";
import type { BotController } from "../services/bot-controller";
import type { CommandContext, CommandIntent } from "../types";
import { splitMessage } from "./utils";

export type CommandRouter = {
  handleInteraction: (interaction: Interaction) => Promise<void>;
  handleMessage: (msg: Message) => Promise<void>;
};

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
    canManageGuild:
      msg.member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false,
    voiceChannelId: msg.member?.voice.channel?.id ?? undefined,
    reply: async (content) => {
      const chunks = splitMessage(content);
      for (const chunk of chunks) {
        await msg.reply(chunk);
      }
    },
    replyWithImage: async ({ buffer, filename, caption }) => {
      await msg.reply({
        content: caption || "",
        files: [{ attachment: buffer, name: filename }],
      });
    },
  });

  const buildInteractionContext = (
    interaction: ChatInputCommandInteraction | ButtonInteraction,
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
      canManageGuild:
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ??
        false,
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
      replyWithImage: async ({ buffer, filename, caption }) => {
        const payload = {
          content: caption || "",
          files: [{ attachment: buffer, name: filename }],
        };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload);
        } else {
          await interaction.reply(payload);
        }
      },
    };
  };

  const handleInteraction = async (interaction: Interaction) => {
    if (!interaction.inGuild()) return;

    if (interaction.isButton()) {
      const startMatch = /^grim:start:(\d+)$/.exec(interaction.customId);
      const stopMatch = /^grim:stop:(\d+)$/.exec(interaction.customId);
      if (!startMatch && !stopMatch) return;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ctx = buildInteractionContext(interaction, "edit");
      if (startMatch) {
        await controller.handleStartReminder(Number(startMatch[1]), ctx);
        return;
      }

      const sessionId = Number(stopMatch?.[1]);
      await controller.stopSessionById({
        guildId: ctx.guildId,
        channelId: ctx.channelId,
        sessionId,
        reason: "stop_button",
        reply: ctx.reply,
      });
      return;
    }

    if (!interaction.isChatInputCommand()) return;

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
      } else if (sub === "scene") {
        const prompt = interaction.options.getString("prompt", true);
        intent = { type: "scene", prompt };
      }
    } else if (interaction.commandName === "campaign") {
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();

      if (group === "schedule" && sub === "set") {
        intent = {
          type: "schedule_set",
          weekday: interaction.options.getInteger("weekday", true),
          localTime: interaction.options.getString("time", true),
          timeZone: interaction.options.getString("timezone", true),
        };
      } else if (group === "schedule" && sub === "show") {
        intent = { type: "schedule_show" };
      } else if (group === "schedule" && sub === "remove") {
        intent = { type: "schedule_remove" };
      } else if (sub === "create") {
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
