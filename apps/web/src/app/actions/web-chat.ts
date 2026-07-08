"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { webChatMessages } from "@/db/schema";
import { requireCampaignAccess } from "@/lib/auth/campaign-access";

/**
 * Delete the signed-in user's web chat conversation for a campaign
 * ("burn the pages"). Same access check as the other campaign actions.
 */
export async function clearWebChat(campaignId: number): Promise<void> {
  const { userId } = await requireCampaignAccess(campaignId);
  await db
    .delete(webChatMessages)
    .where(
      and(
        eq(webChatMessages.campaignId, campaignId),
        eq(webChatMessages.userId, userId),
      ),
    );
}
