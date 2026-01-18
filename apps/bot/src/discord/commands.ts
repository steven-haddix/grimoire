import type { Message } from "discord.js";
import type { BotController } from "../services/bot-controller";
import { parseCommand } from "../services/command-parser";
import type { CommandContext } from "../types";

export type CommandRouter = {
  handleMessage: (msg: Message) => Promise<void>;
};

export function createCommandRouter(params: {
  controller: BotController;
}): CommandRouter {
  const { controller } = params;
  const handleMessage = async (msg: Message) => {
    if (!msg.inGuild() || msg.author.bot) return;

    const { intent, isCommand } = parseCommand(msg.content);
    if (!isCommand || !intent) return;

    const ctx: CommandContext = {
      guildId: msg.guild.id,
      channelId: msg.channel.id,
      userId: msg.author.id,
      userName: msg.author.username,
      voiceChannelId: msg.member?.voice.channel?.id,
      reply: async (content) => {
        await msg.reply(content);
      },
    };

    await controller.handleIntent(intent, ctx);
  };

  return { handleMessage };
}
