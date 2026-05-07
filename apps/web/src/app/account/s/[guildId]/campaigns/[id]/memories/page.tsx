import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/grimoire/primitives";
import { db } from "@/db";
import { campaigns, memories } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { MemoriesView } from "./memories-view";

interface MemoriesPageProps {
  params: Promise<{ guildId: string; id: string }>;
}

export default async function MemoriesPage(props: MemoriesPageProps) {
  const params = await props.params;
  const guildId = params.guildId;
  const campaignId = parseInt(params.id, 10);
  if (Number.isNaN(campaignId)) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guild = userGuilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) notFound();
  if (campaign.guildId !== guildId) {
    redirect(
      `/account/s/${campaign.guildId}/campaigns/${campaign.id}/memories`,
    );
  }

  const all = await db
    .select()
    .from(memories)
    .where(eq(memories.campaignId, campaignId))
    .orderBy(desc(memories.createdAt));

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: guild.name, href: `/account/s/${guildId}/campaigns` },
          {
            label: campaign.name,
            href: `/account/s/${guildId}/campaigns/${campaign.id}`,
          },
          { label: "Memories" },
        ]}
      />
      <div className="page" style={{ maxWidth: 1200 }}>
        <MemoriesView
          memories={all}
          campaignId={campaignId}
          campaignName={campaign.name}
        />
      </div>
    </>
  );
}
