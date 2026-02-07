import { desc, eq } from "drizzle-orm";
import type { RuntimeDb } from "../client";
import { chatMessages } from "../schema-runtime";

export async function appendChatMessage(
  db: RuntimeDb,
  input: {
    campaignId: number;
    guildId: string;
    channelId: string;
    userId: string;
    displayName: string;
    content: string;
    isBot: boolean;
  },
) {
  await db.insert(chatMessages).values({
    campaignId: input.campaignId,
    guildId: input.guildId,
    channelId: input.channelId,
    userId: input.userId,
    displayName: input.displayName,
    content: input.content,
    isBot: input.isBot,
  });
}

export async function listRecentChatMessages(
  db: RuntimeDb,
  campaignId: number,
  limit: number,
) {
  return db
    .select({
      displayName: chatMessages.displayName,
      content: chatMessages.content,
      isBot: chatMessages.isBot,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.campaignId, campaignId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);
}
