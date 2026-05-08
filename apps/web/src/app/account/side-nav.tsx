"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { authClient } from "@/lib/auth/client";
import { BrandMark, Diamond } from "@/components/grimoire/marks";

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
      campaignSubpath: "live" | "memories" | "illustrations" | null;
    };

function parseScope(pathname: string): Scope {
  const match = pathname.match(
    /^\/account\/s\/([^/]+)(?:\/campaigns\/(\d+)(?:\/(live|memories|illustrations))?)?/,
  );
  if (!match) return { kind: "global" };
  const guildId = match[1] ?? "";
  if (!guildId) return { kind: "global" };
  const campaignId = match[2] ? Number.parseInt(match[2], 10) : null;
  const campaignSubpath =
    match[3] === "live" ||
    match[3] === "memories" ||
    match[3] === "illustrations"
      ? match[3]
      : null;
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
  const onPicker = pathname === "/account";

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

  const libraryItems = activeGuild
    ? [
        {
          href: `/account/s/${activeGuild.id}/campaigns`,
          label: "Campaigns",
          count: scopedCounts.campaigns,
          matchExact: true,
        },
        {
          href: `/account/s/${activeGuild.id}/sessions`,
          label: "Sessions",
          count: scopedCounts.sessions,
          matchExact: false,
        },
      ]
    : [];

  const renderNavItem = (
    item: {
      href: string;
      label: string;
      count?: number | string;
      matchExact?: boolean;
    },
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

      <ServerPickerCard
        activeGuild={activeGuild}
        scopedCampaigns={scopedCounts.campaigns}
        guildCount={guilds.length}
        onPicker={onPicker}
      />

      {libraryItems.length > 0 ? (
        <div className="nav-section">
          <div className="nav-section__lbl">
            <span>This server</span>
          </div>
          {libraryItems.map((item) => renderNavItem(item))}
        </div>
      ) : null}

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

function ServerPickerCard({
  activeGuild,
  scopedCampaigns,
  guildCount,
  onPicker,
}: {
  activeGuild: GuildContext | null;
  scopedCampaigns: number;
  guildCount: number;
  onPicker: boolean;
}) {
  // Card is a Link to the picker page. The card is the dropdown — clicking
  // it lands you on /account where you can switch.
  if (activeGuild) {
    return (
      <div className="nav-section">
        <div className="nav-section__lbl">
          <span>Server</span>
          <span className="t-meta t-meta--lit" style={{ fontSize: 9 }}>
            switch
          </span>
        </div>
        <Link href="/account" className="nav-guild">
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
              {scopedCampaigns}{" "}
              {scopedCampaigns === 1 ? "campaign" : "campaigns"}
            </span>
          </span>
          <span
            aria-hidden
            style={{
              color: "var(--bone-mute)",
              fontSize: 12,
              marginLeft: 8,
            }}
          >
            ▾
          </span>
        </Link>
      </div>
    );
  }

  // Unscoped — server card invites a pick. Dimmed to copper outline if you're
  // already on the picker page.
  return (
    <div className="nav-section">
      <div className="nav-section__lbl">
        <span>Server</span>
        <span className="t-meta" style={{ fontSize: 9 }}>
          {guildCount} {guildCount === 1 ? "available" : "available"}
        </span>
      </div>
      <Link
        href="/account"
        className="nav-guild"
        style={{
          borderColor: onPicker ? "var(--copper-dim)" : undefined,
          color: onPicker ? "var(--bone)" : undefined,
        }}
      >
        <span
          className="nav-guild__sigil"
          style={{
            color: onPicker ? "var(--copper)" : "var(--bone-dim)",
          }}
        >
          ?
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: "block",
              color: "var(--bone)",
              fontSize: 11.5,
            }}
          >
            Pick a server
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
            no scope active
          </span>
        </span>
        <span
          aria-hidden
          style={{
            color: "var(--bone-mute)",
            fontSize: 12,
            marginLeft: 8,
          }}
        >
          ▾
        </span>
      </Link>
    </div>
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
