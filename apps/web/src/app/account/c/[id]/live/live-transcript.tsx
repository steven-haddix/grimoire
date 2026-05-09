"use client";

import * as React from "react";
import { Caret } from "@/components/grimoire/primitives";

type Line = {
  id: number;
  timestamp: Date;
  speaker: string;
  content: string;
};

function offsetLabel(start: Date, ts: Date) {
  const ms = ts.getTime() - start.getTime();
  if (ms < 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function elapsedSince(start: Date, now: number) {
  const ms = now - start.getTime();
  if (ms < 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function LiveTranscript({
  sessionId,
  sessionStartedAt,
  initialLines,
}: {
  campaignId: number;
  sessionId: number;
  sessionStartedAt: Date;
  initialLines: Line[];
}) {
  const [lines, setLines] = React.useState<Line[]>(initialLines);
  const [now, setNow] = React.useState<number>(() => Date.now());
  const [autoScroll, setAutoScroll] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastIdRef = React.useRef<number>(
    initialLines.length > 0
      ? initialLines[initialLines.length - 1]!.id
      : 0,
  );

  // Tick clock for elapsed display
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Poll the API for new lines every 5s. The route exists for the bot
  // to write into — for now we GET the latest list. Falls back gracefully.
  React.useEffect(() => {
    let cancelled = false;
    const pollUrl = `/api/session/${sessionId}/transcripts?since=${lastIdRef.current}`;
    const poll = async () => {
      try {
        const res = await fetch(pollUrl, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { lines?: Line[] };
        if (data.lines && data.lines.length > 0) {
          const parsed = data.lines.map((l) => ({
            ...l,
            timestamp: new Date(l.timestamp),
          }));
          setLines((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const merged = [...prev];
            for (const l of parsed) {
              if (!seen.has(l.id)) merged.push(l);
            }
            return merged;
          });
          const last = parsed[parsed.length - 1];
          if (last && last.id > lastIdRef.current) {
            lastIdRef.current = last.id;
          }
        }
      } catch {
        // silently fail — server-side polling is best-effort
      }
    };
    const id = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [sessionId]);

  // Auto-scroll to bottom when new lines arrive
  React.useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [autoScroll]);

  const elapsed = elapsedSince(sessionStartedAt, now);
  const lastLine = lines[lines.length - 1];

  return (
    <div>
      <div
        ref={scrollRef}
        style={{
          maxHeight: 540,
          overflowY: "auto",
          paddingRight: 12,
          padding: 28,
          background: "oklch(0.20 0.012 80)",
          border: "0.5px solid var(--rule-soft)",
        }}
      >
        {lines.length === 0 ? (
          <div
            className="t-meta"
            style={{ textAlign: "center", padding: "32px 0" }}
          >
            waiting for first utterance…
          </div>
        ) : (
          <div className="transcript">
            {lines.map((l, i) => {
              const isLast = i === lines.length - 1;
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
                  <span className="tx-line__txt">
                    {l.content}
                    {isLast ? <Caret /> : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="t-meta">
          <span style={{ color: "var(--copper)" }}>{elapsed}</span> elapsed ·{" "}
          {lines.length} {lines.length === 1 ? "line" : "lines"}
          {lastLine ? ` · last from ${lastLine.speaker}` : ""}
        </div>
        <button
          type="button"
          className="t-meta t-meta--lit"
          onClick={() => setAutoScroll((v) => !v)}
          style={{ background: "none", border: 0, cursor: "pointer" }}
        >
          auto-scroll {autoScroll ? "on ✓" : "off"}
        </button>
      </div>
    </div>
  );
}
