"use client";

import { format } from "date-fns";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import {
  firstSentence,
  remainderAfterFirstSentence,
} from "@/lib/text/derive";

type Tab = "summary" | "transcript" | "memories" | "illustrations";

type TranscriptLine = {
  id: number;
  timestamp: Date;
  speaker: string;
  content: string;
};

type CapturedMemory = {
  id: number;
  content: string;
  category: string;
  createdAt: Date;
  source: string | null;
};

type SessionIllustration = {
  id: number;
  caption: string | null;
  userPrompt: string | null;
  source: string;
  createdAt: Date;
};

function memoryVariant(category: string) {
  if (["lore", "character", "rule", "meta"].includes(category)) {
    return category as "lore" | "character" | "rule" | "meta";
  }
  return "other" as const;
}

function offsetLabel(start: Date, ts: Date) {
  const ms = ts.getTime() - start.getTime();
  if (ms < 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function SessionDetail({
  summary,
  summaryRevisions,
  summaryUpdatedAt,
  transcripts,
  memories,
  illustrations,
  sessionStartedAt,
  sessionEndedAt,
}: {
  summary: string | null;
  summaryRevisions: number;
  summaryUpdatedAt: Date | null;
  transcripts: TranscriptLine[];
  memories: CapturedMemory[];
  illustrations: SessionIllustration[];
  sessionStartedAt: Date;
  sessionEndedAt: Date | null;
}) {
  const initial: Tab =
    summary || transcripts.length === 0
      ? "summary"
      : transcripts.length > 0
        ? "transcript"
        : "summary";
  const [tab, setTab] = React.useState<Tab>(initial);

  // Filter memories captured around this session window (within 1h after end,
  // or — for in-progress sessions — anything created after start).
  const capturedDuringSession = memories.filter((m) => {
    if (m.createdAt < sessionStartedAt) return false;
    if (sessionEndedAt) {
      const buffer = 60 * 60 * 1000;
      return m.createdAt.getTime() <= sessionEndedAt.getTime() + buffer;
    }
    return true;
  });

  return (
    <>
      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === "summary" ? "tab--active" : ""}`}
          onClick={() => setTab("summary")}
        >
          Summary{" "}
          <small>{summaryRevisions > 0 ? `v${summaryRevisions}` : "—"}</small>
        </button>
        <button
          type="button"
          className={`tab ${tab === "transcript" ? "tab--active" : ""}`}
          onClick={() => setTab("transcript")}
        >
          Transcript <small>{transcripts.length}</small>
        </button>
        <button
          type="button"
          className={`tab ${tab === "memories" ? "tab--active" : ""}`}
          onClick={() => setTab("memories")}
        >
          Memories captured <small>{capturedDuringSession.length}</small>
        </button>
        <button
          type="button"
          className={`tab ${tab === "illustrations" ? "tab--active" : ""}`}
          onClick={() => setTab("illustrations")}
        >
          Illustrations <small>{illustrations.length}</small>
        </button>
      </div>

      <div style={{ paddingTop: 36 }}>
        {tab === "summary" ? (
          <SummaryTab
            summary={summary}
            updatedAt={summaryUpdatedAt}
            revisions={summaryRevisions}
          />
        ) : null}
        {tab === "transcript" ? (
          <TranscriptTab
            lines={transcripts}
            sessionStartedAt={sessionStartedAt}
          />
        ) : null}
        {tab === "memories" ? (
          <CapturedMemoriesTab memories={capturedDuringSession} />
        ) : null}
        {tab === "illustrations" ? (
          <IllustrationsTab items={illustrations} />
        ) : null}
      </div>
    </>
  );
}

function IllustrationsTab({ items }: { items: SessionIllustration[] }) {
  if (items.length === 0) {
    return (
      <div
        style={{
          border: "0.5px dashed var(--rule)",
          padding: "60px 32px",
          textAlign: "center",
          background: "var(--ink-2)",
          color: "var(--bone-mute)",
          maxWidth: 720,
        }}
      >
        <h3 className="t-display" style={{ fontSize: 26, marginBottom: 10 }}>
          No illustrations
        </h3>
        <p className="t-meta" style={{ maxWidth: 480, margin: "0 auto" }}>
          Nothing was painted during this session. Conjure a scene from the
          gallery any time.
        </p>
      </div>
    );
  }
  return (
    <div className="gal" style={{ gridTemplateColumns: "repeat(2, 1fr)", maxWidth: 880 }}>
      {items.map((g) => (
        <div key={g.id} className="gal__cell" style={{ cursor: "default" }}>
          <a
            href={`/api/illustrations/${g.id}/image`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "block",
              border: "0.5px solid var(--rule)",
              background: "var(--ink-2)",
              aspectRatio: "4 / 3",
              overflow: "hidden",
            }}
          >
            {/* biome-ignore lint/performance/noImgElement: same-origin API */}
            <img
              src={`/api/illustrations/${g.id}/image`}
              alt={g.caption ?? "Generated illustration"}
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </a>
          <div>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: 17,
                color: "var(--bone)",
                fontVariationSettings: '"opsz" 144',
              }}
            >
              {g.caption ?? "Untitled"}
            </div>
            <div
              className="t-meta"
              style={{ marginTop: 4, fontStyle: "italic" }}
            >
              {g.userPrompt
                ? `"${g.userPrompt.length > 100 ? `${g.userPrompt.slice(0, 100)}…` : g.userPrompt}"`
                : "auto · derived from current scene"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryTab({
  summary,
  updatedAt,
  revisions,
}: {
  summary: string | null;
  updatedAt: Date | null;
  revisions: number;
}) {
  if (!summary) {
    return (
      <div
        style={{
          border: "0.5px dashed var(--rule)",
          padding: "60px 32px",
          textAlign: "center",
          background: "var(--ink-2)",
          color: "var(--bone-mute)",
          maxWidth: 720,
        }}
      >
        <h3 className="t-display" style={{ fontSize: 26, marginBottom: 10 }}>
          No summary yet
        </h3>
        <p className="t-meta" style={{ maxWidth: 480, margin: "0 auto" }}>
          Grimoire generates a summary when the session ends. If this session is
          still in progress, the rolling recap is updating in the live view.
        </p>
      </div>
    );
  }

  return (
    <article style={{ maxWidth: 720 }}>
      <div className="t-meta" style={{ marginBottom: 24 }}>
        Summarized by Grimoire
        {revisions > 1 ? ` · revised ${revisions - 1} times` : ""}
        {updatedAt ? ` · last revision ${format(updatedAt, "PPP")}` : ""}
      </div>
      <div className="prose-grim">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
      </div>
    </article>
  );
}

function TranscriptTab({
  lines,
  sessionStartedAt,
}: {
  lines: TranscriptLine[];
  sessionStartedAt: Date;
}) {
  if (lines.length === 0) {
    return (
      <div
        style={{
          border: "0.5px dashed var(--rule)",
          padding: "60px 32px",
          textAlign: "center",
          background: "var(--ink-2)",
          color: "var(--bone-mute)",
          maxWidth: 720,
        }}
      >
        <h3 className="t-display" style={{ fontSize: 26, marginBottom: 10 }}>
          No transcript captured
        </h3>
        <p className="t-meta" style={{ maxWidth: 480, margin: "0 auto" }}>
          The bot wasn't recording, or the audio didn't surface enough speech
          to transcribe.
        </p>
      </div>
    );
  }

  const speakers = Array.from(new Set(lines.map((l) => l.speaker)));

  return (
    <div style={{ maxWidth: 880 }}>
      <div className="t-meta" style={{ marginBottom: 18 }}>
        {lines.length} lines · {speakers.length}{" "}
        {speakers.length === 1 ? "speaker" : "speakers"}
      </div>
      <div className="transcript">
        {lines.map((l) => {
          const sp = l.speaker.toUpperCase();
          const isGM = /\b(GM|DM|MASTER|NARRATOR)\b/.test(sp);
          return (
            <div key={l.id} className="tx-line">
              <span className="tx-line__ts">
                {offsetLabel(sessionStartedAt, l.timestamp)}
              </span>
              <span
                className={`tx-line__sp ${isGM ? "tx-line__sp--gm" : ""}`}
              >
                {l.speaker}
              </span>
              <span className="tx-line__txt">{l.content}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CapturedMemoriesTab({ memories }: { memories: CapturedMemory[] }) {
  if (memories.length === 0) {
    return (
      <div
        style={{
          border: "0.5px dashed var(--rule)",
          padding: "60px 32px",
          textAlign: "center",
          background: "var(--ink-2)",
          color: "var(--bone-mute)",
          maxWidth: 720,
        }}
      >
        <h3 className="t-display" style={{ fontSize: 26, marginBottom: 10 }}>
          No memories captured
        </h3>
        <p className="t-meta" style={{ maxWidth: 480, margin: "0 auto" }}>
          Memories are extracted into the campaign brain during long-form
          sessions. Nothing was captured around this one — yet.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="t-meta" style={{ marginBottom: 24 }}>
        {memories.length}{" "}
        {memories.length === 1 ? "memory" : "memories"} captured
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {memories.map((m) => (
          <div key={m.id} className="mem">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <span className="mem__title">{firstSentence(m.content)}</span>
              <Badge variant={memoryVariant(m.category)}>{m.category}</Badge>
            </div>
            <div className="mem__body">
              {remainderAfterFirstSentence(m.content)}
            </div>
            <div className="mem__foot">
              <span className="t-meta">
                captured {format(m.createdAt, "MMM d, yyyy")}
                {m.source ? ` · ${m.source}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

