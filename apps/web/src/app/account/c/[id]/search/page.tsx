import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/grimoire/primitives";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { SearchView } from "./search-view";

interface SearchPageProps {
  params: Promise<{ id: string }>;
}

export default async function SearchPage(props: SearchPageProps) {
  const params = await props.params;
  const campaignId = parseInt(params.id, 10);
  if (Number.isNaN(campaignId)) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) notFound();

  const userGuilds = await getUserAdminGuilds();
  if (!userGuilds.some((g) => g.id === campaign.guildId)) notFound();

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          {
            label: campaign.name,
            href: `/account/c/${campaign.id}`,
          },
          { label: "Search" },
        ]}
      />
      <div className="page" style={{ maxWidth: 900 }}>
        <SearchView campaignId={campaignId} campaignName={campaign.name} />
      </div>
    </>
  );
}
