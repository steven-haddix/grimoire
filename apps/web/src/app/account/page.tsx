import { and, count, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { botGuilds, campaigns, sessions } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { Diamond, Tick } from "@/components/grimoire/marks";
import { Pulse } from "@/components/grimoire/primitives";
import { InstallBotButton } from "@/components/install-bot-button";
import { Badge } from "@/components/ui/badge";

export default async function AccountHome() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);

  // Auto-redirect single-guild users straight into their server scope.
  if (userGuilds.length === 1) {
    redirect(`/account/s/${userGuilds[0]!.id}/campaigns`);
  }

  const [installedGuilds, campaignCounts, activeSessions] =
    guildIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(botGuilds)
            .where(inArray(botGuilds.guildId, guildIds)),
          db
            .select({ guildId: campaigns.guildId, value: count() })
            .from(campaigns)
            .where(inArray(campaigns.guildId, guildIds))
            .groupBy(campaigns.guildId),
          db
            .select({ guildId: sessions.guildId })
            .from(sessions)
            .where(
              and(
                inArray(sessions.guildId, guildIds),
                eq(sessions.status, "active"),
              ),
            ),
        ])
      : [[], [], []];

  const installedSet = new Set(
    installedGuilds.filter((g) => g.installed).map((g) => g.guildId),
  );
  const campaignsByGuild = new Map(
    campaignCounts.map((c) => [c.guildId, c.value]),
  );
  const liveByGuild = new Set(activeSessions.map((s) => s.guildId));

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
          <div className="t-eyebrow">Pick a server</div>
          <h1
            className="t-display"
            style={{ fontSize: 36, marginTop: 6 }}
          >
            Your <em>servers</em>
          </h1>
        </div>
        <InstallBotButton>
          <Diamond size={5} /> Install on a server
        </InstallBotButton>
      </div>

      {userGuilds.length === 0 ? (
        <EmptyServers />
      ) : (
        <div className="guild-grid">
          {userGuilds.map((guild) => {
            const installed = installedSet.has(guild.id);
            const live = liveByGuild.has(guild.id);
            const guildCampaigns = campaignsByGuild.get(guild.id) ?? 0;
            return (
              <GuildCard
                key={guild.id}
                id={guild.id}
                name={guild.name}
                glyph={guild.name.slice(0, 1).toUpperCase()}
                installed={installed}
                live={live}
                campaignCount={guildCampaigns}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function GuildCard({
  id,
  name,
  glyph,
  installed,
  live,
  campaignCount,
}: {
  id: string;
  name: string;
  glyph: string;
  installed: boolean;
  live: boolean;
  campaignCount: number;
}) {
  const Header = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <span className="guild-card__sigil">{glyph}</span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "flex-end",
        }}
      >
        {live ? (
          <Badge variant="lit">
            <Pulse /> live
          </Badge>
        ) : null}
        {!installed ? <Badge variant="meta">not installed</Badge> : null}
      </div>
    </div>
  );

  const Body = (
    <div>
      <div className="guild-card__name">{name}</div>
      <div className="t-meta" style={{ marginTop: 6 }}>
        {campaignCount}{" "}
        {campaignCount === 1 ? "campaign" : "campaigns"}
        {installed ? " · bot connected" : " · awaiting install"}
      </div>
    </div>
  );

  if (installed) {
    return (
      <Link
        href={`/account/s/${id}/campaigns`}
        className="guild-card"
        style={{ textDecoration: "none", display: "flex" }}
      >
        {Header}
        {Body}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <span className="t-meta" style={{ fontSize: 9 }}>
            /{id}
          </span>
          <span className="t-meta t-meta--lit">enter →</span>
        </div>
      </Link>
    );
  }

  return (
    <div
      className="guild-card"
      style={{ display: "flex", cursor: "default" }}
    >
      {Header}
      {Body}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginTop: 8,
        }}
      >
        <span className="t-meta" style={{ fontSize: 9 }}>
          /{id}
        </span>
        <InstallBotButton guildId={id}>
          <Diamond size={5} /> Install
        </InstallBotButton>
      </div>
    </div>
  );
}

function EmptyServers() {
  return (
    <div
      style={{
        border: "0.5px dashed var(--rule)",
        padding: "48px 32px",
        textAlign: "center",
        background: "var(--ink-2)",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          margin: "0 auto 18px",
          border: "0.5px solid var(--rule)",
          display: "grid",
          placeItems: "center",
          color: "var(--bone-mute)",
        }}
      >
        <Tick size={20} />
      </div>
      <h2 className="t-display" style={{ fontSize: 28, marginBottom: 12 }}>
        No servers yet
      </h2>
      <p
        className="t-meta"
        style={{ maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.6 }}
      >
        Grimoire only sees Discord servers where you have Administrator or
        Manage Guild permissions. If you have those, the server should appear
        here within a few minutes — or install the bot on a new server now.
      </p>
      <InstallBotButton>
        <Diamond size={5} /> Install on a server
      </InstallBotButton>
    </div>
  );
}
