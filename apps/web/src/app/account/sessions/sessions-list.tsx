"use client";

import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Pulse } from "@/components/grimoire/primitives";
import { Badge } from "@/components/ui/badge";

interface Session {
  id: number;
  guildId: string;
  channelId: string;
  campaignId: number | null;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
}

interface Campaign {
  id: number;
  name: string;
  guildId: string;
}

interface Summary {
  id: number;
  sessionId: number;
  text: string;
  createdAt: Date;
}

interface SessionsListProps {
  sessions: Session[];
  campaigns: Campaign[];
  summariesBySession: Record<number, Summary[]>;
  guildMap: Record<string, string>;
}

function durationLabel(start: Date, end: Date | null) {
  if (!end) return "in progress";
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem.toString().padStart(2, "0")}m`;
}

function deriveTitle(text: string | undefined): string {
  if (!text) return "Untitled session";
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith("# ")) return line.slice(2).trim();
  }
  for (const line of lines) {
    if (!line.startsWith("#") && line.length > 6) {
      return line.length > 80 ? `${line.slice(0, 80)}…` : line;
    }
  }
  return "Untitled session";
}

function deriveHook(text: string | undefined): string | null {
  if (!text) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // skip leading header, find first paragraph
  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith(">")) continue;
    if (line.startsWith("-") || line.startsWith("*")) continue;
    if (line.length < 16) continue;
    return line.length > 240 ? `${line.slice(0, 240)}…` : line;
  }
  return null;
}

export function SessionsList({
  sessions,
  campaigns,
  summariesBySession,
  guildMap,
}: SessionsListProps) {
  const [filter, setFilter] = React.useState<string>("all");

  const filtered =
    filter === "all"
      ? sessions
      : filter === "active"
        ? sessions.filter((s) => s.status === "active")
        : sessions.filter((s) => s.campaignId === parseInt(filter, 10));

  const campaignMap = new Map(campaigns.map((c) => [c.id, c.name]));
  const activeCount = sessions.filter((s) => s.status === "active").length;

  return (
    <>
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
          <div className="t-eyebrow">All sessions across all servers</div>
          <h1 className="t-display" style={{ fontSize: 44, marginTop: 8 }}>
            <em>{sessions.length}</em>{" "}
            {sessions.length === 1 ? "night" : "nights"} of play
          </h1>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 28 }}>
        <button
          type="button"
          className={`tab ${filter === "all" ? "tab--active" : ""}`}
          onClick={() => setFilter("all")}
        >
          All <small>{sessions.length}</small>
        </button>
        {activeCount > 0 ? (
          <button
            type="button"
            className={`tab ${filter === "active" ? "tab--active" : ""}`}
            onClick={() => setFilter("active")}
          >
            Active <small>{activeCount}</small>
          </button>
        ) : null}
        {campaigns.map((c) => {
          const cnt = sessions.filter((s) => s.campaignId === c.id).length;
          if (cnt === 0) return null;
          return (
            <button
              type="button"
              key={c.id}
              className={`tab ${filter === c.id.toString() ? "tab--active" : ""}`}
              onClick={() => setFilter(c.id.toString())}
            >
              {c.name} <small>{cnt}</small>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p
          className="t-meta"
          style={{ paddingTop: 24, fontStyle: "italic" }}
        >
          No sessions to show.
        </p>
      ) : (
        <div>
          {filtered.map((s) => {
            const summaryList = summariesBySession[s.id] ?? [];
            const latestSummary = summaryList[0];
            const title = deriveTitle(latestSummary?.text);
            const hook = deriveHook(latestSummary?.text);
            const isLive = s.status === "active";
            const campaignName = s.campaignId
              ? campaignMap.get(s.campaignId)
              : null;
            const guildName = guildMap[s.guildId] ?? "Unknown";

            return (
              <Link
                key={s.id}
                href={
                  isLive && s.campaignId
                    ? `/account/s/${s.guildId}/campaigns/${s.campaignId}/live`
                    : `/account/s/${s.guildId}/sessions/${s.id}`
                }
                className="session-row"
                style={{
                  gridTemplateColumns: "60px 220px 1fr auto",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  className="session-num"
                  style={{ color: isLive ? "var(--copper)" : undefined }}
                >
                  #{s.id}
                </div>
                <div className="t-meta" style={{ paddingTop: 4 }}>
                  <span style={{ color: "var(--bone-dim)" }}>
                    {campaignName ?? guildName}
                  </span>
                  <br />
                  <span>
                    {isLive
                      ? `${formatDistanceToNow(s.startedAt, { addSuffix: true })} · running`
                      : format(s.startedAt, "MMM d, yyyy")}
                  </span>
                </div>
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <h3
                      style={{
                        fontFamily: "var(--serif)",
                        fontSize: 19,
                        margin: 0,
                        fontWeight: 500,
                        fontStyle: isLive ? "italic" : "normal",
                        color: "var(--bone)",
                        fontVariationSettings: '"opsz" 144',
                      }}
                    >
                      {isLive ? "(in progress)" : title}
                    </h3>
                    {isLive ? (
                      <Badge variant="live">
                        <Pulse /> live
                      </Badge>
                    ) : null}
                  </div>
                  {!isLive && hook ? (
                    <p
                      style={{
                        color: "var(--bone-mute)",
                        fontSize: 12.5,
                        margin: "6px 0 0",
                        maxWidth: 560,
                        lineHeight: 1.55,
                      }}
                    >
                      {hook}
                    </p>
                  ) : null}
                  {summaryList.length === 0 && !isLive ? (
                    <p
                      className="t-meta"
                      style={{
                        margin: "6px 0 0",
                        fontStyle: "italic",
                        color: "var(--bone-mute)",
                      }}
                    >
                      no summary generated
                    </p>
                  ) : null}
                </div>
                <div
                  className="t-meta"
                  style={{ paddingTop: 4, textAlign: "right" }}
                >
                  {durationLabel(s.startedAt, s.endedAt)}
                  <br />
                  <span style={{ color: "var(--bone-mute)" }}>
                    {summaryList.length > 0
                      ? `${summaryList.length} ${summaryList.length === 1 ? "summary" : "summaries"}`
                      : "—"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

// Markdown renderer used elsewhere; export so other screens can reuse.
export const markdownComponents = {
  h1: ({ ...props }) => (
    <h1
      style={{
        fontFamily: "var(--serif)",
        fontSize: 28,
        margin: "1.2em 0 0.4em",
        fontVariationSettings: '"opsz" 144',
        fontWeight: 500,
        color: "var(--bone)",
      }}
      {...props}
    />
  ),
  h2: ({ ...props }) => (
    <h2
      style={{
        fontFamily: "var(--serif)",
        fontSize: 22,
        margin: "1.3em 0 0.4em",
        fontVariationSettings: '"opsz" 144',
        fontWeight: 500,
        color: "var(--bone)",
      }}
      {...props}
    />
  ),
  h3: ({ ...props }) => (
    <h3
      style={{
        fontFamily: "var(--mono)",
        fontWeight: 500,
        fontSize: 11,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--copper)",
        margin: "1.6em 0 0.6em",
      }}
      {...props}
    />
  ),
};

export function MarkdownSummary({ children }: { children: string }) {
  return (
    <div className="prose-grim">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
