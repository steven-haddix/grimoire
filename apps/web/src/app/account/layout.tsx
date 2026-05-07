import { count, desc, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  botGuilds,
  campaigns,
  illustrations,
  memories,
  sessions,
} from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { SideNav, type GuildContext, type LibraryCounts } from "./side-nav";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);

  const [
    allCampaigns,
    perGuildCampaignCounts,
    perGuildSessionCounts,
    perGuildMemoryCounts,
    activeCampaignSettings,
    perCampaignMemoryCounts,
    perCampaignIllustrationCounts,
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
            .select({ guildId: campaigns.guildId, value: count() })
            .from(campaigns)
            .where(inArray(campaigns.guildId, guildIds))
            .groupBy(campaigns.guildId),
          db
            .select({ guildId: sessions.guildId, value: count() })
            .from(sessions)
            .where(inArray(sessions.guildId, guildIds))
            .groupBy(sessions.guildId),
          db
            .select({ guildId: campaigns.guildId, value: count() })
            .from(memories)
            .innerJoin(campaigns, eq(memories.campaignId, campaigns.id))
            .where(inArray(campaigns.guildId, guildIds))
            .groupBy(campaigns.guildId),
          db
            .select()
            .from(botGuilds)
            .where(inArray(botGuilds.guildId, guildIds)),
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
            .innerJoin(
              campaigns,
              eq(illustrations.campaignId, campaigns.id),
            )
            .where(inArray(campaigns.guildId, guildIds))
            .groupBy(illustrations.campaignId),
        ])
      : [[], [], [], [], [], [], []];

  const guildContexts: GuildContext[] = userGuilds.map((g) => ({
    id: g.id,
    name: g.name,
    glyph: g.name.slice(0, 1).toUpperCase(),
  }));

  const campaignsByGuildCount = new Map(
    perGuildCampaignCounts.map((row) => [row.guildId, row.value]),
  );
  const sessionsByGuildCount = new Map(
    perGuildSessionCounts.map((row) => [row.guildId, row.value]),
  );
  const memoriesByGuildCount = new Map(
    perGuildMemoryCounts.map((row) => [row.guildId, row.value]),
  );
  const memoriesByCampaignCount = new Map(
    perCampaignMemoryCounts.map((row) => [row.campaignId, row.value]),
  );
  const activeCampaignByGuild = new Map(
    activeCampaignSettings.map((row) => [row.guildId, row.activeCampaignId]),
  );

  const totalCampaigns = allCampaigns.length;
  const totalSessions = Array.from(sessionsByGuildCount.values()).reduce(
    (a, b) => a + b,
    0,
  );
  const totalMemories = Array.from(memoriesByGuildCount.values()).reduce(
    (a, b) => a + b,
    0,
  );

  const counts: LibraryCounts = {
    cross: {
      campaigns: totalCampaigns,
      sessions: totalSessions,
      memories: totalMemories,
    },
    perGuild: Object.fromEntries(
      guildIds.map((gid) => [
        gid,
        {
          campaigns: campaignsByGuildCount.get(gid) ?? 0,
          sessions: sessionsByGuildCount.get(gid) ?? 0,
          memories: memoriesByGuildCount.get(gid) ?? 0,
        },
      ]),
    ),
    perCampaignMemories: Object.fromEntries(
      Array.from(memoriesByCampaignCount.entries()),
    ),
    perCampaignIllustrations: Object.fromEntries(
      perCampaignIllustrationCounts.map((row) => [row.campaignId, row.value]),
    ),
  };

  const userName =
    session.user?.name ?? session.user?.email ?? "Adventurer";
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
        guilds={guildContexts}
        campaigns={allCampaigns.map((c) => ({
          id: c.id,
          name: c.name,
          guildId: c.guildId,
          isActive:
            activeCampaignByGuild.get(c.guildId) === c.id,
        }))}
        counts={counts}
      />
      <main className="app__main">{children}</main>
    </div>
  );
}
