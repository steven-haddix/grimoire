import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/grimoire/primitives";
import { db } from "@/db";
import { campaigns, illustrations } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { IllustrationsView } from "./illustrations-view";

interface IllustrationsPageProps {
  params: Promise<{ guildId: string; id: string }>;
}

export default async function IllustrationsPage(
  props: IllustrationsPageProps,
) {
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
      `/account/s/${campaign.guildId}/campaigns/${campaign.id}/illustrations`,
    );
  }

  const items = await db
    .select({
      id: illustrations.id,
      caption: illustrations.caption,
      userPrompt: illustrations.userPrompt,
      mimeType: illustrations.mimeType,
      width: illustrations.width,
      height: illustrations.height,
      sessionId: illustrations.sessionId,
      source: illustrations.source,
      createdAt: illustrations.createdAt,
    })
    .from(illustrations)
    .where(eq(illustrations.campaignId, campaignId))
    .orderBy(desc(illustrations.createdAt));

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
          { label: "Illustrations" },
        ]}
      />
      <div className="page" style={{ maxWidth: 1280 }}>
        <IllustrationsView
          campaignId={campaignId}
          campaignName={campaign.name}
          guildId={guildId}
          items={items.map((i) => ({
            ...i,
            createdAt: i.createdAt.toISOString(),
          }))}
        />
      </div>
    </>
  );
}
