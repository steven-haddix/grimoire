"use server";

import { db } from "@/db";
import { botGuilds, campaigns } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

export async function createCampaign(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const guildId = formData.get("guildId") as string;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  if (!guildId || !name) {
    throw new Error("Missing required fields");
  }

  // Verify user has admin access to this guild
  const adminGuilds = await getUserAdminGuilds();
  const hasAccess = adminGuilds.some((g) => g.id === guildId);

  if (!hasAccess) {
    throw new Error("Unauthorized access to guild");
  }

  // Check if bot is installed in this guild (optional but good practice)
  // We can just proceed to create the campaign.

  const [newCampaign] = await db
    .insert(campaigns)
    .values({
      guildId,
      name,
      description,
    })
    .returning({ id: campaigns.id });

  if (!newCampaign) {
    throw new Error("Failed to create campaign");
  }

  // If no active campaign exists, make this one active?
  // Or just leave it inactive. Let's check if there is an active one.
  const guildSettings = await db.query.botGuilds.findFirst({
    where: eq(botGuilds.guildId, guildId),
  });

  if (guildSettings && !guildSettings.activeCampaignId) {
    await db
      .update(botGuilds)
      .set({ activeCampaignId: newCampaign.id })
      .where(eq(botGuilds.guildId, guildId));
  }

  revalidatePath("/account/campaigns");
  return { success: true, campaignId: newCampaign.id };
}

export async function setActiveCampaign(campaignId: number, guildId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  // Verify user has admin access to this guild
  const adminGuilds = await getUserAdminGuilds();
  const hasAccess = adminGuilds.some((g) => g.id === guildId);

  if (!hasAccess) {
    throw new Error("Unauthorized access to guild");
  }

  // Verify campaign belongs to guild
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.guildId, guildId)),
  });

  if (!campaign) {
    throw new Error("Campaign not found");
  }

  await db
    .update(botGuilds)
    .set({ activeCampaignId: campaignId })
    .where(eq(botGuilds.guildId, guildId));

  revalidatePath("/account/campaigns");
  return { success: true };
}
