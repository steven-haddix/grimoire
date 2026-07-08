import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";

/**
 * Access error with an HTTP status, so route handlers can map it to a
 * response while server actions can treat it as a plain Error.
 */
export class CampaignAccessError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type CampaignAccess = {
  /** better-auth user id of the signed-in user. */
  userId: string;
  campaign: typeof campaigns.$inferSelect;
};

/**
 * Resolve the signed-in user and verify they admin the guild that owns the
 * campaign — the same rules the campaign server actions enforce.
 */
export async function requireCampaignAccess(
  campaignId: number,
): Promise<CampaignAccess> {
  if (!Number.isFinite(campaignId)) {
    throw new CampaignAccessError("Invalid campaign", 400);
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new CampaignAccessError("Unauthorized", 401);

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) throw new CampaignAccessError("Campaign not found", 404);

  const adminGuilds = await getUserAdminGuilds();
  if (!adminGuilds.some((g) => g.id === campaign.guildId)) {
    throw new CampaignAccessError("Forbidden", 403);
  }

  return { userId: session.user.id, campaign };
}
