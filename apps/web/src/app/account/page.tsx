import { format, formatDistanceToNow } from "date-fns";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  max,
} from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CreateCampaignDialog } from "@/components/create-campaign-dialog";
import { Diamond } from "@/components/grimoire/marks";
import { Pulse } from "@/components/grimoire/primitives";
import { InstallBotButton } from "@/components/install-bot-button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { botGuilds, campaigns, sessions } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";

export default async function AccountHome() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);
  const guildNamesById = new Map(userGuilds.map((g) => [g.id, g.name]));

  const allCampaigns =
    guildIds.length > 0
      ? await db
          .select()
          .from(campaigns)
          .where(inArray(campaigns.guildId, guildIds))
          .orderBy(desc(campaigns.updatedAt))
      : [];

  // Auto-redirect single-campaign users straight into their campaign.
  if (allCampaigns.length === 1) {
    redirect(`/account/c/${allCampaigns[0]!.id}`);
  }

  const campaignIds = allCampaigns.map((c) => c.id);

  const [
    activeCampaignSettings,
    sessionStatsRows,
    liveSessionRows,
  ] =
    campaignIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(botGuilds)
            .where(inArray(botGuilds.guildId, guildIds)),
          db
            .select({
              campaignId: sessions.campaignId,
              sessionCount: count(),
              lastPlayed: max(sessions.startedAt),
            })
            .from(sessions)
            .where(inArray(sessions.campaignId, campaignIds))
            .groupBy(sessions.campaignId),
          db
            .select({ campaignId: sessions.campaignId })
            .from(sessions)
            .where(
              and(
                inArray(sessions.campaignId, campaignIds),
                eq(sessions.status, "active"),
              ),
            ),
        ])
      : [
          await db
            .select()
            .from(botGuilds)
            .where(inArray(botGuilds.guildId, guildIds)),
          [],
          [],
        ];

  const activeCampaignByGuild = new Map(
    activeCampaignSettings.map((row) => [row.guildId, row.activeCampaignId]),
  );
  const statsByCampaign = new Map(
    sessionStatsRows.map((row) => [
      row.campaignId,
      { sessionCount: row.sessionCount, lastPlayed: row.lastPlayed },
    ]),
  );
  const liveCampaignIds = new Set(liveSessionRows.map((r) => r.campaignId));

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <div className="t-eyebrow">Pick a campaign</div>
          <h1
            className="t-display"
            style={{ fontSize: 36, marginTop: 6 }}
          >
            Your <em>chronicles</em>
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <CreateCampaignDialog guilds={userGuilds} />
          <InstallBotButton variant="ghost">
            <Diamond size={5} /> Add a server
          </InstallBotButton>
        </div>
      </div>

      {allCampaigns.length === 0 ? (
        <EmptyCampaigns hasGuilds={userGuilds.length > 0} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {allCampaigns.map((c) => {
            const stats = statsByCampaign.get(c.id);
            const isActive =
              activeCampaignByGuild.get(c.guildId) === c.id;
            const isLive = liveCampaignIds.has(c.id);
            const guildName =
              guildNamesById.get(c.guildId) ?? "Unknown server";
            const lastPlayed = stats?.lastPlayed
              ? formatDistanceToNow(stats.lastPlayed, { addSuffix: true })
              : "never";
            return (
              <Link
                key={c.id}
                href={`/account/c/${c.id}`}
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
                    color: isActive ? "var(--copper)" : "var(--bone-dim)",
                    fontVariationSettings: '"opsz" 144',
                  }}
                >
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <h2
                      style={{
                        fontFamily: "var(--serif)",
                        fontSize: 26,
                        margin: 0,
                        fontWeight: 500,
                        color: "var(--bone)",
                        fontVariationSettings: '"opsz" 144',
                      }}
                    >
                      {c.name}
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
                  <div
                    className="t-meta"
                    style={{
                      marginBottom: 8,
                      color: "var(--bone-dim)",
                    }}
                  >
                    {guildName}
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
                    {c.description ||
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
                    created {format(c.createdAt, "MMM d, yyyy")}
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
    </div>
  );
}

function EmptyCampaigns({ hasGuilds }: { hasGuilds: boolean }) {
  return (
    <div
      style={{
        border: "0.5px dashed var(--rule)",
        padding: "60px 32px",
        textAlign: "center",
        background: "var(--ink-2)",
      }}
    >
      <h2
        className="t-display"
        style={{ fontSize: 32, marginTop: 14, marginBottom: 12 }}
      >
        Terra Incognita
      </h2>
      <p
        className="t-meta"
        style={{
          maxWidth: 480,
          margin: "0 auto 20px",
          lineHeight: 1.6,
        }}
      >
        {hasGuilds
          ? "No campaigns have been chronicled yet. Start one with the New campaign button — pick the server it belongs to."
          : "Grimoire only sees Discord servers where you have Administrator or Manage Guild permissions. Install the bot on one of your servers to begin."}
      </p>
      {hasGuilds ? null : (
        <InstallBotButton>
          <Diamond size={5} /> Install on a server
        </InstallBotButton>
      )}
    </div>
  );
}
