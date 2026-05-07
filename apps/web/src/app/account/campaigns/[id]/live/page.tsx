import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { campaigns } from "@/db/schema";

interface LiveRedirectProps {
  params: Promise<{ id: string }>;
}

export default async function LiveRedirect(props: LiveRedirectProps) {
  const { id } = await props.params;
  const campaignId = parseInt(id, 10);
  if (Number.isNaN(campaignId)) notFound();

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) notFound();

  redirect(`/account/s/${campaign.guildId}/campaigns/${campaign.id}/live`);
}
