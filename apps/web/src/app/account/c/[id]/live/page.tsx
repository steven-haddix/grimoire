import { and, asc, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Pulse,
  RailSection,
  StatusLine,
  Topbar,
  Wave,
} from "@/components/grimoire/primitives";
import { db } from "@/db";
import { campaigns, sessions, summaries, transcripts } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { LiveTranscript } from "./live-transcript";

interface LivePageProps {
  params: Promise<{ id: string }>;
}

export default async function LivePage(props: LivePageProps) {
  const params = await props.params;
  const campaignId = parseInt(params.id, 10);
  if (Number.isNaN(campaignId)) notFound();

  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) redirect("/auth/sign-in");

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) notFound();

  const userGuilds = await getUserAdminGuilds();
  const guild = userGuilds.find((g) => g.id === campaign.guildId);
  if (!guild) notFound();

  const liveSession = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.campaignId, campaignId),
      eq(sessions.status, "active"),
    ),
  });

  if (!liveSession) {
    return (
      <>
        <Topbar
          crumbs={[
            { label: "GRIMOIRE", href: "/account" },
            { label: campaign.name, href: `/account/c/${campaign.id}` },
            { label: "Live" },
          ]}
        />
        <div className="page" style={{ maxWidth: 720 }}>
          <div
            style={{
              border: "0.5px dashed var(--rule)",
              padding: "80px 32px",
              textAlign: "center",
              background: "var(--ink-2)",
            }}
          >
            <h1
              className="t-display"
              style={{ fontSize: 44, marginBottom: 14 }}
            >
              Nothing <em>recording</em>
            </h1>
            <p
              className="t-meta"
              style={{ maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}
            >
              No live session for {campaign.name} right now. Use{" "}
              <code
                style={{
                  fontFamily: "var(--mono)",
                  color: "var(--copper)",
                }}
              >
                /grim start
              </code>{" "}
              in your Discord voice channel to begin one.
            </p>
            <Link
              href={`/account/c/${campaign.id}`}
              className="t-meta t-meta--lit"
              style={{
                display: "inline-block",
                marginTop: 24,
                textDecoration: "none",
              }}
            >
              ← back to {campaign.name}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const [lines, latestSummaries] = await Promise.all([
    db
      .select()
      .from(transcripts)
      .where(eq(transcripts.sessionId, liveSession.id))
      .orderBy(asc(transcripts.timestamp)),
    db
      .select()
      .from(summaries)
      .where(eq(summaries.sessionId, liveSession.id))
      .orderBy(desc(summaries.createdAt))
      .limit(1),
  ]);

  const latestSummary = latestSummaries[0];
  const speakers = Array.from(new Set(lines.map((l) => l.speaker)));
  const lastLine = lines[lines.length - 1];

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: campaign.name, href: `/account/c/${campaign.id}` },
          { label: `Live · #${liveSession.id}` },
        ]}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Pulse />
            <span
              className="t-meta t-meta--lit"
              style={{ fontSize: 11 }}
            >
              RECORDING
            </span>
          </div>
        }
      />
      <div className="page">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 40,
          }}
          className="live-grid"
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <div className="t-eyebrow">Live transcript</div>
                <h1
                  className="t-display"
                  style={{ fontSize: 36, fontWeight: 500, margin: "8px 0 0" }}
                >
                  Tonight's session
                </h1>
              </div>
            </div>

            <div className="rule" style={{ marginBottom: 24 }} />

            <LiveTranscript
              campaignId={campaignId}
              sessionId={liveSession.id}
              sessionStartedAt={liveSession.startedAt}
              initialLines={lines.map((l) => ({
                id: l.id,
                timestamp: l.timestamp,
                speaker: l.speaker,
                content: l.content,
              }))}
            />

            {latestSummary ? (
              <div style={{ marginTop: 36 }}>
                <div className="t-eyebrow" style={{ marginBottom: 14 }}>
                  Rolling recap · auto-updates as the agent extracts
                </div>
                <article
                  className="prose-grim"
                  style={{
                    fontSize: 14,
                    color: "var(--bone-dim)",
                    maxWidth: 720,
                  }}
                >
                  {latestSummary.text.slice(0, 800)}
                  {latestSummary.text.length > 800 ? "…" : ""}
                </article>
              </div>
            ) : null}
          </div>

          <aside
            style={{ display: "flex", flexDirection: "column", gap: 28 }}
          >
            <RailSection title="Now in voice">
              {speakers.length === 0 ? (
                <div
                  className="t-meta"
                  style={{ fontStyle: "italic", padding: "8px 0" }}
                >
                  no speech captured yet
                </div>
              ) : (
                speakers.map((s) => {
                  const speaking = lastLine?.speaker === s;
                  return (
                    <div
                      key={s}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 0",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          border: "0.5px solid",
                          borderColor: speaking
                            ? "var(--copper-dim)"
                            : "var(--rule)",
                          display: "grid",
                          placeItems: "center",
                          fontFamily: "var(--serif)",
                          fontSize: 13,
                          color: speaking
                            ? "var(--copper)"
                            : "var(--bone-dim)",
                          fontVariationSettings: '"opsz" 144',
                          flexShrink: 0,
                        }}
                      >
                        {s.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontFamily: "var(--serif)",
                            fontSize: 14,
                            color: "var(--bone)",
                            fontVariationSettings: '"opsz" 144',
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {s}
                        </div>
                        <div className="t-meta">
                          {speaking ? "spoke last" : "in transcript"}
                        </div>
                      </div>
                      {speaking ? <Wave height={18} bars={4} /> : null}
                    </div>
                  );
                })
              )}
            </RailSection>

            <RailSection title="Session info">
              <StatusLine
                label="Server"
                value={guild.name}
                lit
              />
              <StatusLine
                label="Channel"
                value={liveSession.channelId}
              />
              <StatusLine
                label="Started"
                value={<LocalTime timestamp={liveSession.startedAt} />}
              />
              <StatusLine label="Lines" value={lines.length.toString()} />
              <StatusLine
                label="Speakers"
                value={speakers.length.toString()}
              />
            </RailSection>

            <div className="t-meta" style={{ lineHeight: 1.6 }}>
              The bot will write a final summary into{" "}
              <Link
                href={`/account/c/${campaign.id}/sessions/${liveSession.id}`}
                className="t-meta t-meta--lit"
                style={{ textDecoration: "none" }}
              >
                session #{liveSession.id}
              </Link>{" "}
              when you call{" "}
              <code
                style={{ color: "var(--copper)", fontFamily: "var(--mono)" }}
              >
                /grim stop
              </code>
              .
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function LocalTime({ timestamp }: { timestamp: Date }) {
  return (
    <time dateTime={timestamp.toISOString()}>
      {timestamp.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </time>
  );
}
