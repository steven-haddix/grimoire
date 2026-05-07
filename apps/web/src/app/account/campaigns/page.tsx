import { format, formatDistanceToNow } from "date-fns";
import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CreateCampaignDialog } from "@/components/create-campaign-dialog";
import { Diamond } from "@/components/grimoire/marks";
import { Pulse, Topbar } from "@/components/grimoire/primitives";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { botGuilds, campaigns, sessions } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import {
  getUserAdminGuilds,
  invalidateUserAdminGuildsCache,
} from "@/lib/discord/server";

interface CampaignsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CampaignsPage(props: CampaignsPageProps) {
  const searchParams = await props.searchParams;

  if (searchParams.installed === "true") {
    await invalidateUserAdminGuildsCache();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);

  if (guildIds.length === 0) {
    return (
      <>
        <Topbar
          crumbs={[
            { label: "GRIMOIRE", href: "/account" },
            { label: "Campaigns" },
          ]}
        />
        <div className="page" style={{ maxWidth: 1100 }}>
          <EmptyState
            title="No kingdoms found"
            body="It seems you have no administrative power in any Discord servers. Claim your throne as an administrator to begin your chronicle."
          />
        </div>
      </>
    );
  }

  const allCampaigns = await db
    .select()
    .from(campaigns)
    .where(inArray(campaigns.guildId, guildIds))
    .orderBy(desc(campaigns.updatedAt));

  const guildSettings = await db
    .select()
    .from(botGuilds)
    .where(inArray(botGuilds.guildId, guildIds));

  const activeCampaignByGuild = new Map(
    guildSettings.map((g) => [g.guildId, g.activeCampaignId]),
  );

  const campaignIds = allCampaigns.map((c) => c.id);
  const sessionStatsRows =
    campaignIds.length > 0
      ? await db
          .select({
            campaignId: sessions.campaignId,
            sessionCount: count(),
            lastPlayed: max(sessions.startedAt),
          })
          .from(sessions)
          .where(inArray(sessions.campaignId, campaignIds))
          .groupBy(sessions.campaignId)
      : [];

  const liveSessionRows =
    campaignIds.length > 0
      ? await db
          .select({ campaignId: sessions.campaignId })
          .from(sessions)
          .where(
            and(
              inArray(sessions.campaignId, campaignIds),
              eq(sessions.status, "active"),
            ),
          )
      : [];

  const statsByCampaign = new Map(
    sessionStatsRows.map((s) => [
      s.campaignId,
      { sessionCount: s.sessionCount, lastPlayed: s.lastPlayed },
    ]),
  );
  const liveCampaignIds = new Set(liveSessionRows.map((s) => s.campaignId));

  const guildNamesById = new Map(userGuilds.map((g) => [g.id, g.name]));

  // Group campaigns by guild
  const campaignsByGuild = new Map<string, typeof allCampaigns>();
  for (const id of guildIds) campaignsByGuild.set(id, []);
  for (const campaign of allCampaigns) {
    campaignsByGuild.get(campaign.guildId)?.push(campaign);
  }

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: "Campaigns" },
        ]}
        right={<CreateCampaignDialog guilds={userGuilds} />}
      />

      <div className="page" style={{ maxWidth: 1100 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 30,
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="t-eyebrow">Library</div>
            <h1
              className="t-display"
              style={{ fontSize: 56, marginTop: 8 }}
            >
              Your <em>chronicles</em>
            </h1>
          </div>
          <div className="t-meta">
            {allCampaigns.length}{" "}
            {allCampaigns.length === 1 ? "campaign" : "campaigns"} across{" "}
            {userGuilds.length}{" "}
            {userGuilds.length === 1 ? "server" : "servers"}
          </div>
        </div>

        {allCampaigns.length === 0 ? (
          <EmptyState
            title="Terra Incognita"
            body="No campaigns have been chronicled yet. Start one with the button above."
          />
        ) : (
          userGuilds.map((guild) => {
            const list = campaignsByGuild.get(guild.id) ?? [];
            const activeId = activeCampaignByGuild.get(guild.id) ?? null;
            return (
              <section
                key={guild.id}
                style={{ marginBottom: 56, position: "relative" }}
              >
                <header
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    marginBottom: 18,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 9.5,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "var(--bone-mute)",
                    }}
                  >
                    {guildNamesById.get(guild.id) ?? "Unknown server"}
                  </span>
                  <div
                    style={{
                      flex: 1,
                      height: 0,
                      borderTop: "0.5px solid var(--rule-soft)",
                    }}
                  />
                </header>

                {list.length === 0 ? (
                  <div
                    style={{
                      border: "0.5px dashed var(--rule)",
                      padding: "32px 24px",
                      textAlign: "center",
                      color: "var(--bone-mute)",
                    }}
                  >
                    <span className="t-meta">
                      no campaigns chronicled in this realm yet
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {list.map((campaign) => {
                      const stats = statsByCampaign.get(campaign.id);
                      const isActive = activeId === campaign.id;
                      const isLive = liveCampaignIds.has(campaign.id);
                      const lastPlayed = stats?.lastPlayed
                        ? formatDistanceToNow(stats.lastPlayed, {
                            addSuffix: true,
                          })
                        : "never";
                      return (
                        <Link
                          key={campaign.id}
                          href={`/account/s/${campaign.guildId}/campaigns/${campaign.id}`}
                          className="session-row"
                          style={{
                            gridTemplateColumns: "80px 1fr 220px auto",
                            padding: "28px 18px",
                            textDecoration: "none",
                            color: "inherit",
                          }}
                        >
                          <div
                            style={{
                              width: 64,
                              height: 64,
                              border: "0.5px solid var(--rule)",
                              display: "grid",
                              placeItems: "center",
                              fontFamily: "var(--serif)",
                              fontSize: 30,
                              color: isActive
                                ? "var(--copper)"
                                : "var(--bone-dim)",
                              fontVariationSettings: '"opsz" 144',
                            }}
                          >
                            {campaign.name.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                marginBottom: 8,
                                flexWrap: "wrap",
                              }}
                            >
                              <h2
                                style={{
                                  fontFamily: "var(--serif)",
                                  fontSize: 28,
                                  margin: 0,
                                  fontWeight: 500,
                                  color: "var(--bone)",
                                  fontVariationSettings: '"opsz" 144',
                                }}
                              >
                                {campaign.name}
                              </h2>
                              {isLive ? (
                                <Badge variant="live">
                                  <span
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: 99,
                                      background: "var(--ink)",
                                    }}
                                  />{" "}
                                  recording
                                </Badge>
                              ) : isActive ? (
                                <Badge variant="lit">
                                  <Pulse /> active
                                </Badge>
                              ) : null}
                            </div>
                            <p
                              style={{
                                color: "var(--bone-dim)",
                                fontSize: 14,
                                lineHeight: 1.5,
                                margin: 0,
                                maxWidth: 540,
                              }}
                            >
                              {campaign.description ||
                                "The story is yet to be written."}
                            </p>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                              paddingTop: 8,
                            }}
                          >
                            <span className="t-meta">
                              <span style={{ color: "var(--bone)" }}>
                                {stats?.sessionCount ?? 0}
                              </span>{" "}
                              sessions logged
                            </span>
                            <span className="t-meta">
                              last played{" "}
                              <span style={{ color: "var(--bone-dim)" }}>
                                {lastPlayed}
                              </span>
                            </span>
                            <span className="t-meta" style={{ fontSize: 9 }}>
                              created {format(campaign.createdAt, "MMM d, yyyy")}
                            </span>
                          </div>
                          <div
                            style={{
                              alignSelf: "center",
                              paddingLeft: 16,
                            }}
                          >
                            <span className="t-meta t-meta--lit">open →</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </>
  );
}

function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        border: "0.5px dashed var(--rule)",
        padding: "60px 32px",
        textAlign: "center",
        background: "var(--ink-2)",
      }}
    >
      <Diamond size={10} className="opacity-40" />
      <h2
        className="t-display"
        style={{ fontSize: 32, marginTop: 14, marginBottom: 12 }}
      >
        {title}
      </h2>
      <p
        className="t-meta"
        style={{
          maxWidth: 480,
          margin: "0 auto",
          lineHeight: 1.6,
        }}
      >
        {body}
      </p>
    </div>
  );
}
