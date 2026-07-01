"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import {
  type CampaignSearchResult,
  searchCampaignHistory,
} from "@/lib/search/search";

async function assertCampaignAccess(campaignId: number) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");

  const adminGuilds = await getUserAdminGuilds();
  if (!adminGuilds.some((g) => g.id === campaign.guildId)) {
    throw new Error("Forbidden");
  }
  return campaign;
}

/**
 * Search a campaign's indexed history (summaries, transcript chunks,
 * memories) for the web UI. Same hybrid retrieval the Discord agent uses,
 * gated by the same campaign access check as the other server actions.
 */
export async function searchCampaign(
  campaignId: number,
  query: string,
): Promise<CampaignSearchResult[]> {
  if (!Number.isFinite(campaignId)) throw new Error("Invalid campaign");
  await assertCampaignAccess(campaignId);
  return searchCampaignHistory({ campaignId, query, limit: 20 });
}
