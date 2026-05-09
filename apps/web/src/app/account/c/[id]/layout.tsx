import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { getUserAdminGuilds } from "@/lib/discord/server";

export default async function CampaignScopedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaignId = parseInt(id, 10);
  if (Number.isNaN(campaignId)) notFound();

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) notFound();

  const userGuilds = await getUserAdminGuilds();
  if (!userGuilds.some((g) => g.id === campaign.guildId)) {
    notFound();
  }

  return <>{children}</>;
}
