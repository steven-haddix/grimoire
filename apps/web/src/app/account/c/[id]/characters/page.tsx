import { eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/grimoire/primitives";
import { db } from "@/db";
import { campaigns, players, sessions } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { loadCampaignGraph } from "@/lib/extraction/graph";
import { CharactersView, type RosterEntity } from "./characters-view";

interface CharactersPageProps {
  params: Promise<{ id: string }>;
}

export default async function CharactersPage(props: CharactersPageProps) {
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

  const graph = await loadCampaignGraph(campaignId);
  const live = graph.filter(
    (e) => !e.suppressedAt && e.mergedIntoEntityId == null,
  );

  const playerRows = await db
    .select({ id: players.id, displayName: players.displayName })
    .from(players)
    .where(eq(players.campaignId, campaignId));
  const playerNames = new Map(playerRows.map((p) => [p.id, p.displayName]));

  const lastSeenIds = [
    ...new Set(
      live
        .map((e) => e.lastSeenSessionId)
        .filter((id): id is number => id != null),
    ),
  ];
  const sessionRows = lastSeenIds.length
    ? await db
        .select({ id: sessions.id, startedAt: sessions.startedAt })
        .from(sessions)
        .where(inArray(sessions.id, lastSeenIds))
    : [];
  const sessionDates = new Map(
    sessionRows.map((s) => [s.id, s.startedAt?.toISOString() ?? null]),
  );

  const roster: RosterEntity[] = live.map((entity) => ({
    id: entity.id,
    type: entity.type,
    name: entity.name,
    aliases: entity.aliases,
    status: entity.facts.status ?? null,
    lastKnownLocation: entity.facts.last_known_location ?? null,
    description: entity.facts.description ?? null,
    playedBy:
      entity.playerId != null
        ? (playerNames.get(entity.playerId) ?? null)
        : null,
    lastSeenDate:
      entity.lastSeenSessionId != null
        ? (sessionDates.get(entity.lastSeenSessionId) ?? null)
        : null,
  }));

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: campaign.name, href: `/account/c/${campaign.id}` },
          { label: "Characters" },
        ]}
      />
      <div className="page" style={{ maxWidth: 1200 }}>
        <CharactersView
          entities={roster}
          campaignId={campaignId}
          campaignName={campaign.name}
        />
      </div>
    </>
  );
}
