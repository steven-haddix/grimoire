import type {
  ChatInputCommandInteraction,
  GuildMember,
  Interaction,
  Message,
} from "discord.js";
import type { BotController } from "../services/bot-controller";
import type { CommandContext, CommandIntent } from "../types";

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
    voiceChannelId: msg.member?.voice.channel?.id ?? undefined,
    reply: async (content) => {
      await msg.reply(content);
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
      voiceChannelId: member?.voice.channelId ?? undefined,
      reply: async (content) => {
        if (replyStrategy === "edit") {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(content);
          } else {
            await interaction.reply(content);
          }
          return;
        }

        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content, ephemeral: true });
        } else {
          await interaction.reply({ content, ephemeral: true });
        }
      },
    };
  };

  const handleInteraction = async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inGuild()) return;
    if (interaction.commandName !== "scribe") return;

    const sub = interaction.options.getSubcommand();
    let intent: CommandIntent | null = null;

    if (sub === "start") {
      intent = { type: "start" };
    } else if (sub === "stop") {
      intent = { type: "stop" };
    } else if (sub === "say") {
      const text = interaction.options.getString("text", true);
      const voiceOverride =
        interaction.options.getString("voice") ?? undefined;
      intent = { type: "say", text, voiceOverride };
    }

    if (!intent) return;

    if (intent.type === "say") {
      await interaction.reply({
        content: "🗣️ Speaking...",
        ephemeral: true,
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
