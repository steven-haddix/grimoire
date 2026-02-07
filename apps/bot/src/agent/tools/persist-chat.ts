import type { RuntimeDb } from "@grimoire/data/client";
import { appendChatMessage } from "@grimoire/data/repos/chat-messages";

type PersistInput = {
  db: RuntimeDb;
  campaignId: number | null;
  guildId: string;
  channelId: string;
};

export async function persistUserMessage(
  params: PersistInput & {
    userId: string;
    displayName: string;
    content: string;
  },
) {
  if (!params.campaignId) return;

  await appendChatMessage(params.db, {
    campaignId: params.campaignId,
    guildId: params.guildId,
    channelId: params.channelId,
    userId: params.userId,
    displayName: params.displayName,
    content: params.content,
    isBot: false,
  });
}

export async function persistBotReply(
  params: PersistInput & {
    content: string;
  },
) {
  if (!params.campaignId) return;

  await appendChatMessage(params.db, {
    campaignId: params.campaignId,
    guildId: params.guildId,
    channelId: params.channelId,
    userId: "bot",
    displayName: "Grimoire",
    content: params.content,
    isBot: true,
  });
}
