"use client";

import { format } from "date-fns";
import Link from "next/link";
import * as React from "react";
import { Diamond } from "@/components/grimoire/marks";
import { Badge } from "@/components/ui/badge";
import type { EntityType } from "@/db/schema";

export type RosterEntity = {
  id: number;
  type: EntityType;
  name: string;
  aliases: string[];
  status: string | null;
  lastKnownLocation: string | null;
  description: string | null;
  playedBy: string | null;
  lastSeenDate: string | null;
};

const TYPE_TABS = ["all", "pc", "npc", "faction", "location"] as const;
type TypeFilter = (typeof TYPE_TABS)[number];

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: "All",
  pc: "Party",
  npc: "NPCs",
  faction: "Factions",
  location: "Locations",
};

export function entityBadgeVariant(type: EntityType) {
  switch (type) {
    case "pc":
      return "character" as const;
    case "npc":
      return "default" as const;
    case "faction":
      return "lore" as const;
    case "location":
      return "rule" as const;
  }
}

export function CharactersView({
  entities,
  campaignId,
  campaignName,
}: {
  entities: RosterEntity[];
  campaignId: number;
  campaignName: string;
}) {
  const [filter, setFilter] = React.useState<TypeFilter>("all");
  const [search, setSearch] = React.useState("");

  const counts: Record<TypeFilter, number> = {
    all: entities.length,
    pc: 0,
    npc: 0,
    faction: 0,
    location: 0,
  };
  for (const e of entities) {
    counts[e.type] += 1;
  }

  const filtered = entities.filter((e) => {
    if (filter !== "all" && e.type !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [e.name, ...e.aliases].some((name) =>
      name.toLowerCase().includes(q),
    );
  });

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div className="t-eyebrow">{campaignName} · dramatis personae</div>
        <h1 className="t-display" style={{ fontSize: 56, marginTop: 8 }}>
          Who walks these <em>pages</em>
        </h1>
      </div>
      <p
        style={{
          color: "var(--bone-dim)",
          maxWidth: 600,
          marginBottom: 30,
          fontSize: 15,
        }}
      >
        Every character, faction, and place the scribe has tracked across your
        sessions — extracted automatically, editable by hand. Click one to see
        its full record and history.
      </p>

      <div className="tabs" style={{ marginBottom: 24 }}>
        {TYPE_TABS.map((t) => (
          <button
            type="button"
            key={t}
            className={`tab ${filter === t ? "tab--active" : ""}`}
            onClick={() => setFilter(t)}
          >
            {TYPE_LABELS[t]} <small>{counts[t] ?? 0}</small>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 24, maxWidth: 360 }}>
        <div className="search">
          <Diamond size={6} />
          <input
            placeholder="Search characters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            border: "0.5px dashed var(--rule)",
            padding: "60px 32px",
            textAlign: "center",
            background: "var(--ink-2)",
            color: "var(--bone-mute)",
          }}
        >
          <h3 className="t-display" style={{ fontSize: 24, marginBottom: 8 }}>
            {search.trim() ? "No matches" : "No one tracked yet"}
          </h3>
          <p className="t-meta" style={{ maxWidth: 420, margin: "0 auto" }}>
            {search.trim()
              ? "Try a broader search or different type."
              : "When a session is summarized, the scribe extracts its characters, factions, and places here."}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          {filtered.map((e) => (
            <Link
              key={e.id}
              href={`/account/c/${campaignId}/characters/${e.id}`}
              className="mem"
              style={{ textDecoration: "none", display: "block" }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <span className="mem__title">{e.name}</span>
                <Badge variant={entityBadgeVariant(e.type)}>{e.type}</Badge>
              </div>
              {e.description ? (
                <div className="mem__body">{e.description}</div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  marginTop: 10,
                }}
              >
                {e.status ? (
                  <span className="t-meta">status · {e.status}</span>
                ) : null}
                {e.lastKnownLocation ? (
                  <span className="t-meta">
                    last seen at · {e.lastKnownLocation}
                  </span>
                ) : null}
                {e.playedBy ? (
                  <span className="t-meta">played by · {e.playedBy}</span>
                ) : null}
              </div>
              <div className="mem__foot">
                <span className="t-meta">
                  {e.lastSeenDate
                    ? `last seen ${format(new Date(e.lastSeenDate), "MMM d, yyyy")}`
                    : "not seen yet"}
                  {e.aliases.length
                    ? ` · aka ${e.aliases.slice(0, 2).join(", ")}${e.aliases.length > 2 ? "…" : ""}`
                    : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
