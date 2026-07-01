"use client";

import { format } from "date-fns";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { searchCampaign } from "@/app/actions/search";
import { Diamond } from "@/components/grimoire/marks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CampaignSearchResult } from "@/lib/search/search";

// How much of a result to show before offering "show more". Transcript chunks
// run to ~1500 chars, which would drown the result list.
const PREVIEW_CHAR_LIMIT = 420;

function sourceVariant(sourceType: CampaignSearchResult["sourceType"]) {
  switch (sourceType) {
    case "summary":
      return "lit" as const;
    case "memory":
      return "lore" as const;
    default:
      return "default" as const;
  }
}

function sourceLabel(result: CampaignSearchResult): string {
  if (result.sourceType === "memory") return "memory";
  const session = result.sessionNumber
    ? `session ${result.sessionNumber}`
    : "session";
  return `${result.sourceType} · ${session}`;
}

export function SearchView({
  campaignId,
  campaignName,
}: {
  campaignId: number;
  campaignName: string;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<CampaignSearchResult[] | null>(
    null,
  );
  const [searched, setSearched] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const runSearch = (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    startTransition(async () => {
      try {
        const found = await searchCampaign(campaignId, q);
        setResults(found);
        setSearched(q);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Search failed");
      }
    });
  };

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div className="t-eyebrow">{campaignName} · the campaign record</div>
        <h1 className="t-display" style={{ fontSize: 56, marginTop: 8 }}>
          Search the <em>record</em>
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
        Every session summary, transcript, and remembered fact in this campaign
        — matched by meaning and by exact name. The same recall the agent uses
        when you ask it in Discord.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 30,
          maxWidth: 640,
        }}
      >
        <div className="search" style={{ flex: 1 }}>
          <Diamond size={6} />
          <input
            placeholder="Who was the innkeeper in Barrowmoor…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Searching…" : "Search"}
        </Button>
      </form>

      {results === null ? (
        <div className="t-meta" style={{ color: "var(--bone-mute)" }}>
          Try a name, a place, an item — or a whole question. Quoted
          &quot;phrases&quot; match exactly.
        </div>
      ) : results.length === 0 ? (
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
            Nothing in the record
          </h3>
          <p className="t-meta" style={{ maxWidth: 420, margin: "0 auto" }}>
            No match for “{searched}”. Live sessions are covered too — try other
            names, a &quot;quoted phrase&quot;, or a rephrasing.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="t-meta" style={{ color: "var(--bone-mute)" }}>
            {results.length} result{results.length === 1 ? "" : "s"} for “
            {searched}”
          </div>
          {results.map((r, i) => (
            <ResultCard
              key={`${r.sourceType}-${r.sessionId ?? "m"}-${i}`}
              result={r}
              campaignId={campaignId}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ResultCard({
  result,
  campaignId,
}: {
  result: CampaignSearchResult;
  campaignId: number;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const content = result.content.trim();
  const truncated = !expanded && content.length > PREVIEW_CHAR_LIMIT;
  const shown = truncated
    ? `${content.slice(0, PREVIEW_CHAR_LIMIT)}…`
    : content;

  const href =
    result.sourceType === "memory"
      ? `/account/c/${campaignId}/memories`
      : result.sessionId
        ? `/account/c/${campaignId}/sessions/${result.sessionId}`
        : null;

  return (
    <div
      style={{
        border: "0.5px solid var(--rule)",
        background: "var(--ink-2)",
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <Badge variant={sourceVariant(result.sourceType)}>
            {sourceLabel(result)}
          </Badge>
          {result.speaker ? (
            <span className="t-meta" style={{ color: "var(--bone-dim)" }}>
              {result.speaker}
            </span>
          ) : null}
        </span>
        <span className="t-meta" style={{ color: "var(--bone-mute)" }}>
          {result.sessionDate
            ? format(new Date(result.sessionDate), "MMM d, yyyy")
            : ""}
        </span>
      </div>
      <div
        style={{
          whiteSpace: "pre-wrap",
          fontSize: 14,
          lineHeight: 1.6,
          color: "var(--bone)",
        }}
      >
        {shown}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        {href ? (
          <Link
            href={href}
            className="t-meta"
            style={{ color: "var(--copper)" }}
          >
            {result.sourceType === "memory"
              ? "view memories →"
              : "open session →"}
          </Link>
        ) : (
          <span />
        )}
        {content.length > PREVIEW_CHAR_LIMIT ? (
          <button
            type="button"
            className="t-meta"
            style={{
              background: "none",
              border: 0,
              cursor: "pointer",
              color: "var(--bone-mute)",
            }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "show less" : "show more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
