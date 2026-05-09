"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { authClient } from "@/lib/auth/client";
import { Diamond } from "@/components/grimoire/marks";

export type CampaignNavEntry = {
  id: number;
  name: string;
  guildId: string;
  guildName: string;
  isActive?: boolean;
  sessionCount: number;
};

export type LibraryCounts = {
  perCampaignSessions: Record<number, number>;
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
  campaigns: CampaignNavEntry[];
  counts: LibraryCounts;
};

type Scope =
  | { kind: "global" }
  | {
      kind: "campaign";
      campaignId: number;
      subpath: "live" | "memories" | "illustrations" | "sessions" | null;
    };

function parseScope(pathname: string): Scope {
  const match = pathname.match(
    /^\/account\/c\/(\d+)(?:\/(live|memories|illustrations|sessions))?/,
  );
  if (!match) return { kind: "global" };
  const campaignId = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(campaignId)) return { kind: "global" };
  const subpath =
    match[2] === "live" ||
    match[2] === "memories" ||
    match[2] === "illustrations" ||
    match[2] === "sessions"
      ? match[2]
      : null;
  return { kind: "campaign", campaignId, subpath };
}

export function SideNav({ user, campaigns, counts }: SideNavProps) {
  const pathname = usePathname() ?? "/account";
  const scope = parseScope(pathname);
  const onPicker = pathname === "/account";

  const activeCampaign =
    scope.kind === "campaign"
      ? campaigns.find((c) => c.id === scope.campaignId) ?? null
      : null;

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
        <span
          className="nav-brand__mark"
          style={{ border: 0, padding: 0 }}
        >
          <Image
            src="/logo.png"
            alt="Grimoire"
            width={32}
            height={32}
            priority
            style={{ width: 32, height: 32, objectFit: "contain" }}
          />
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

      <CampaignPickerCard
        activeCampaign={activeCampaign}
        campaignCount={campaigns.length}
        onPicker={onPicker}
      />

      {activeCampaign ? (
        <div className="nav-section">
          <div className="nav-section__lbl">
            <span>This campaign</span>
            {activeCampaign.isActive ? (
              <span
                className="t-meta t-meta--lit"
                style={{ fontSize: 9 }}
              >
                active
              </span>
            ) : null}
          </div>
          {renderNavItem({
            href: `/account/c/${activeCampaign.id}`,
            label: "Overview",
            matchExact: true,
          })}
          {renderNavItem({
            href: `/account/c/${activeCampaign.id}/live`,
            label: "Live session",
            matchExact: true,
          })}
          {renderNavItem({
            href: `/account/c/${activeCampaign.id}/memories`,
            label: "Memories",
            count: counts.perCampaignMemories[activeCampaign.id] ?? 0,
            matchExact: true,
          })}
          {renderNavItem({
            href: `/account/c/${activeCampaign.id}/illustrations`,
            label: "Illustrations",
            count: counts.perCampaignIllustrations[activeCampaign.id] ?? 0,
            matchExact: true,
          })}
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

function CampaignPickerCard({
  activeCampaign,
  campaignCount,
  onPicker,
}: {
  activeCampaign: CampaignNavEntry | null;
  campaignCount: number;
  onPicker: boolean;
}) {
  if (activeCampaign) {
    return (
      <div className="nav-section">
        <div className="nav-section__lbl">
          <span>Campaign</span>
          <span className="t-meta t-meta--lit" style={{ fontSize: 9 }}>
            switch
          </span>
        </div>
        <Link href="/account" className="nav-guild">
          <span className="nav-guild__sigil">
            {activeCampaign.name.slice(0, 1).toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: "block",
                fontFamily: "var(--serif)",
                color: "var(--bone)",
                fontSize: 13,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontVariationSettings: '"opsz" 144',
              }}
            >
              {activeCampaign.name}
            </span>
            <span
              style={{
                display: "block",
                fontFamily: "var(--mono)",
                fontSize: 9.5,
                color: "var(--bone-mute)",
                letterSpacing: "0.10em",
                marginTop: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {activeCampaign.guildName}
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

  return (
    <div className="nav-section">
      <div className="nav-section__lbl">
        <span>Campaign</span>
        <span className="t-meta" style={{ fontSize: 9 }}>
          {campaignCount} {campaignCount === 1 ? "available" : "available"}
        </span>
      </div>
      <Link
        href="/account"
        className="nav-guild"
        style={{
          borderColor: onPicker ? "var(--copper-dim)" : undefined,
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
            Pick a campaign
          </span>
          <span
            style={{
              display: "block",
              fontFamily: "var(--mono)",
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
