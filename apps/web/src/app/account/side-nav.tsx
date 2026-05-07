"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { authClient } from "@/lib/auth/client";
import { BrandMark, Diamond, Tick } from "@/components/grimoire/marks";

export type GuildContext = {
  id: string;
  name: string;
  glyph?: string;
};

export type CampaignContext = {
  id: number;
  name: string;
  guildId: string;
  isActive?: boolean;
};

export type LibraryCounts = {
  cross: {
    campaigns: number;
    sessions: number;
    memories: number;
  };
  perGuild: Record<
    string,
    {
      campaigns: number;
      sessions: number;
      memories: number;
    }
  >;
  perCampaignMemories: Record<number, number>;
  perCampaignIllustrations: Record<number, number>;
};

type UserContext = {
  name: string;
  initial: string;
  email?: string | null;
};

type SideNavProps = {
  user: UserContext;
  guilds: GuildContext[];
  campaigns: CampaignContext[];
  counts: LibraryCounts;
};

type Scope =
  | { kind: "global" }
  | {
      kind: "guild";
      guildId: string;
      campaignId: number | null;
      campaignSubpath: "live" | "memories" | null;
    };

function parseScope(pathname: string): Scope {
  const match = pathname.match(
    /^\/account\/s\/([^/]+)(?:\/campaigns\/(\d+)(?:\/(live|memories))?)?/,
  );
  if (!match) return { kind: "global" };
  const guildId = match[1] ?? "";
  if (!guildId) return { kind: "global" };
  const campaignId = match[2] ? Number.parseInt(match[2], 10) : null;
  const campaignSubpath =
    match[3] === "live" || match[3] === "memories" ? match[3] : null;
  return {
    kind: "guild",
    guildId,
    campaignId: Number.isFinite(campaignId) ? campaignId : null,
    campaignSubpath,
  };
}

export function SideNav({ user, guilds, campaigns, counts }: SideNavProps) {
  const pathname = usePathname() ?? "/account";
  const scope = parseScope(pathname);

  const activeGuild =
    scope.kind === "guild"
      ? guilds.find((g) => g.id === scope.guildId) ?? null
      : null;
  const activeCampaign =
    scope.kind === "guild" && scope.campaignId
      ? campaigns.find(
          (c) =>
            c.id === scope.campaignId && c.guildId === scope.guildId,
        ) ?? null
      : null;

  const scopedCounts =
    (activeGuild && counts.perGuild[activeGuild.id]) || counts.cross;

  const libraryItems: Array<{
    href: string;
    label: string;
    count?: number | string;
    matchExact?: boolean;
  }> = activeGuild
    ? [
        {
          href: `/account/s/${activeGuild.id}/campaigns`,
          label: "Campaigns",
          count: scopedCounts?.campaigns,
          matchExact: true,
        },
        {
          href: `/account/s/${activeGuild.id}/sessions`,
          label: "Sessions",
          count: scopedCounts?.sessions,
        },
        {
          href: "/account",
          label: "Switch server",
          matchExact: true,
        },
      ]
    : [
        {
          href: "/account",
          label: "Servers",
          matchExact: true,
          count: guilds.length,
        },
        {
          href: "/account/campaigns",
          label: "All campaigns",
          count: counts.cross.campaigns,
        },
        {
          href: "/account/sessions",
          label: "All sessions",
          count: counts.cross.sessions,
        },
      ];

  const renderNavItem = (
    item: (typeof libraryItems)[number],
    depth = 0,
  ) => {
    const active = item.matchExact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`nav-item ${active ? "nav-item--active" : ""}`}
        style={{ paddingLeft: 24 + depth * 14 }}
      >
        <Diamond size={5} />
        <span>{item.label}</span>
        {item.count != null && <small>{item.count}</small>}
      </Link>
    );
  };

  return (
    <aside className="app__nav">
      <Link
        href="/account"
        className="nav-brand"
        style={{ textDecoration: "none" }}
      >
        <span className="nav-brand__mark">
          <BrandMark size={28} />
        </span>
        <span>
          <span className="nav-brand__name">Grimoire</span>
          <span
            className="nav-brand__sub"
            style={{ display: "block" }}
          >
            Scribe · v0.4
          </span>
        </span>
      </Link>

      {activeGuild ? (
        <div className="nav-section">
          <div className="nav-section__lbl">
            <span>Server</span>
            <Tick size={8} />
          </div>
          <Link
            href={`/account/s/${activeGuild.id}/campaigns`}
            className="nav-guild"
          >
            <span className="nav-guild__sigil">
              {activeGuild.glyph ??
                activeGuild.name.slice(0, 1).toUpperCase()}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  color: "var(--bone)",
                  fontSize: 11.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {activeGuild.name}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 9.5,
                  color: "var(--bone-mute)",
                  letterSpacing: "0.10em",
                  marginTop: 1,
                }}
              >
                {scopedCounts.campaigns}{" "}
                {scopedCounts.campaigns === 1 ? "campaign" : "campaigns"}
              </span>
            </span>
          </Link>
        </div>
      ) : null}

      <div className="nav-section">
        <div className="nav-section__lbl">
          <span>{activeGuild ? "This server" : "Library"}</span>
        </div>
        {libraryItems.map((item) => renderNavItem(item))}
      </div>

      {activeGuild && activeCampaign ? (
        <div className="nav-section">
          <div className="nav-section__lbl">
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeCampaign.name}
            </span>
            {activeCampaign.isActive ? (
              <span
                className="t-meta t-meta--lit"
                style={{ fontSize: 9 }}
              >
                active
              </span>
            ) : null}
          </div>
          {renderNavItem(
            {
              href: `/account/s/${activeGuild.id}/campaigns/${activeCampaign.id}`,
              label: "Overview",
              matchExact: true,
            },
            1,
          )}
          {renderNavItem(
            {
              href: `/account/s/${activeGuild.id}/campaigns/${activeCampaign.id}/live`,
              label: "Live session",
              matchExact: true,
            },
            1,
          )}
          {renderNavItem(
            {
              href: `/account/s/${activeGuild.id}/campaigns/${activeCampaign.id}/memories`,
              label: "Memories",
              count: counts.perCampaignMemories[activeCampaign.id] ?? 0,
              matchExact: true,
            },
            1,
          )}
          {renderNavItem(
            {
              href: `/account/s/${activeGuild.id}/campaigns/${activeCampaign.id}/illustrations`,
              label: "Illustrations",
              count:
                counts.perCampaignIllustrations[activeCampaign.id] ?? 0,
              matchExact: true,
            },
            1,
          )}
        </div>
      ) : null}

      {!activeGuild && guilds.length > 1 ? (
        <div className="nav-section">
          <div className="nav-section__lbl">
            <span>Your servers</span>
          </div>
          {guilds.slice(0, 6).map((g) => (
            <Link
              key={g.id}
              href={`/account/s/${g.id}/campaigns`}
              className="nav-item"
              style={{ paddingLeft: 24 }}
            >
              <Diamond size={5} />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {g.name}
              </span>
              <small>
                {counts.perGuild[g.id]?.campaigns ?? 0}
              </small>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="nav-foot">
        <span className="nav-foot__avatar">{user.initial}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              color: "var(--bone-dim)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {user.name}
          </span>
          <span style={{ display: "block", fontSize: 9, opacity: 0.7 }}>
            signed in via Discord
          </span>
        </span>
        <SignOutButton />
      </div>
    </aside>
  );
}

function SignOutButton() {
  const [pending, setPending] = React.useState(false);
  return (
    <button
      type="button"
      className="btn btn--ghost btn--small"
      style={{ padding: "4px 8px", fontSize: 9 }}
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await authClient.signOut();
          window.location.href = "/auth/sign-in";
        } catch {
          setPending(false);
        }
      }}
      aria-label="Sign out"
    >
      out
    </button>
  );
}
