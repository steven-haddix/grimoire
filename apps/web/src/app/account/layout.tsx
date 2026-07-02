import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  botGuilds,
  campaigns,
  entities,
  illustrations,
  memories,
  sessions,
} from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { type CampaignNavEntry, type LibraryCounts, SideNav } from "./side-nav";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);
  const guildNamesById = new Map(userGuilds.map((g) => [g.id, g.name]));

  const [
    allCampaigns,
    activeCampaignSettings,
    perCampaignSessionCounts,
    perCampaignMemoryCounts,
    perCampaignIllustrationCounts,
    perCampaignEntityCounts,
  ] =
    guildIds.length > 0
      ? await Promise.all([
          db
            .select({
              id: campaigns.id,
              name: campaigns.name,
              guildId: campaigns.guildId,
              updatedAt: campaigns.updatedAt,
            })
            .from(campaigns)
            .where(inArray(campaigns.guildId, guildIds))
            .orderBy(desc(campaigns.updatedAt)),
          db
            .select()
            .from(botGuilds)
            .where(inArray(botGuilds.guildId, guildIds)),
          db
            .select({
              campaignId: sessions.campaignId,
              value: count(),
            })
            .from(sessions)
            .innerJoin(campaigns, eq(sessions.campaignId, campaigns.id))
            .where(inArray(campaigns.guildId, guildIds))
            .groupBy(sessions.campaignId),
          db
            .select({
              campaignId: memories.campaignId,
              value: count(),
            })
            .from(memories)
            .innerJoin(campaigns, eq(memories.campaignId, campaigns.id))
            .where(inArray(campaigns.guildId, guildIds))
            .groupBy(memories.campaignId),
          db
            .select({
              campaignId: illustrations.campaignId,
              value: count(),
            })
            .from(illustrations)
            .innerJoin(campaigns, eq(illustrations.campaignId, campaigns.id))
            .where(inArray(campaigns.guildId, guildIds))
            .groupBy(illustrations.campaignId),
          db
            .select({
              campaignId: entities.campaignId,
              value: count(),
            })
            .from(entities)
            .innerJoin(campaigns, eq(entities.campaignId, campaigns.id))
            .where(
              and(
                inArray(campaigns.guildId, guildIds),
                isNull(entities.suppressedAt),
                isNull(entities.mergedIntoEntityId),
              ),
            )
            .groupBy(entities.campaignId),
        ])
      : [[], [], [], [], [], []];

  const activeCampaignByGuild = new Map(
    activeCampaignSettings.map((row) => [row.guildId, row.activeCampaignId]),
  );

  const sessionsByCampaignCount = new Map(
    perCampaignSessionCounts.map((row) => [row.campaignId, row.value]),
  );
  const memoriesByCampaignCount = new Map(
    perCampaignMemoryCounts.map((row) => [row.campaignId, row.value]),
  );
  const illustrationsByCampaignCount = new Map(
    perCampaignIllustrationCounts.map((row) => [row.campaignId, row.value]),
  );
  const entitiesByCampaignCount = new Map(
    perCampaignEntityCounts.map((row) => [row.campaignId, row.value]),
  );

  const campaignEntries: CampaignNavEntry[] = allCampaigns.map((c) => ({
    id: c.id,
    name: c.name,
    guildId: c.guildId,
    guildName: guildNamesById.get(c.guildId) ?? "Unknown server",
    isActive: activeCampaignByGuild.get(c.guildId) === c.id,
    sessionCount: sessionsByCampaignCount.get(c.id) ?? 0,
  }));

  const counts: LibraryCounts = {
    perCampaignMemories: Object.fromEntries(
      Array.from(memoriesByCampaignCount.entries()),
    ),
    perCampaignIllustrations: Object.fromEntries(
      Array.from(illustrationsByCampaignCount.entries()),
    ),
    perCampaignSessions: Object.fromEntries(
      Array.from(sessionsByCampaignCount.entries()),
    ),
    perCampaignEntities: Object.fromEntries(
      Array.from(entitiesByCampaignCount.entries()),
    ),
  };

  const userName = session.user?.name ?? session.user?.email ?? "Adventurer";
  const userInitial = (
    session.user?.name?.[0] ??
    session.user?.email?.[0] ??
    "G"
  ).toUpperCase();

  return (
    <div className="app">
      <SideNav
        user={{
          name: userName,
          initial: userInitial,
          email: session.user?.email ?? null,
        }}
        campaigns={campaignEntries}
        counts={counts}
      />
      <main className="app__main">{children}</main>
    </div>
  );
}
