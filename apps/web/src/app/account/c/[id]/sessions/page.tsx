import { format, formatDistanceToNow } from "date-fns";
import { desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Asterism } from "@/components/grimoire/marks";
import { Topbar, Wave } from "@/components/grimoire/primitives";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { campaigns, sessions, summaries } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { deriveHook, deriveTitle } from "@/lib/text/derive";

interface SessionsPageProps {
  params: Promise<{ id: string }>;
}

function durationLabel(start: Date, end: Date | null) {
  if (!end) return "in progress";
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0
    ? `${hours}h`
    : `${hours}h ${rem.toString().padStart(2, "0")}m`;
}

export default async function CampaignSessionsPage(props: SessionsPageProps) {
  const params = await props.params;
  const campaignId = parseInt(params.id, 10);
  if (Number.isNaN(campaignId)) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) notFound();

  const userGuilds = await getUserAdminGuilds();
  if (!userGuilds.some((g) => g.id === campaign.guildId)) notFound();

  const campaignSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.campaignId, campaignId))
    .orderBy(desc(sessions.startedAt));

  const sessionIds = campaignSessions.map((s) => s.id);
  const sessionSummaries =
    sessionIds.length > 0
      ? await db
          .select()
          .from(summaries)
          .where(inArray(summaries.sessionId, sessionIds))
          .orderBy(desc(summaries.createdAt))
      : [];

  const summariesBySession = new Map<number, typeof sessionSummaries>();
  for (const s of sessionSummaries) {
    const list = summariesBySession.get(s.sessionId) ?? [];
    list.push(s);
    summariesBySession.set(s.sessionId, list);
  }

  const liveSession =
    campaignSessions.find((s) => s.status === "active") ?? null;
  const pastSessions = campaignSessions.filter((s) => s.status !== "active");
  const lastPlayed = campaignSessions[0]?.startedAt ?? null;

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: campaign.name, href: `/account/c/${campaign.id}` },
          { label: "Sessions" },
        ]}
      />
      <div className="page" style={{ maxWidth: 900 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 24,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="t-eyebrow">{campaign.name}</div>
            <h1
              className="t-display"
              style={{ fontSize: 36, marginTop: 6 }}
            >
              Sessions
            </h1>
          </div>
          <span className="t-meta">
            {pastSessions.length} logged
            {liveSession ? " · 1 in progress" : null}
          </span>
        </div>

        <div className="rule" style={{ marginBottom: 4 }} />

        {liveSession ? (
          <Link
            href={`/account/c/${campaign.id}/live`}
            className="session-row"
            style={{
              background:
                "linear-gradient(90deg, oklch(0.22 0.04 50 / 0.18), transparent 60%)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              className="session-num"
              style={{ color: "var(--copper)" }}
            >
              {String(campaignSessions.length).padStart(2, "0")}
              <small>now</small>
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: 22,
                    margin: 0,
                    fontWeight: 500,
                    fontStyle: "italic",
                    color: "var(--bone)",
                    fontVariationSettings: '"opsz" 144',
                  }}
                >
                  (in progress)
                </h3>
                <Badge variant="live">
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 99,
                      background: "var(--ink)",
                    }}
                  />{" "}
                  recording
                </Badge>
              </div>
              <p
                style={{
                  color: "var(--bone-dim)",
                  fontSize: 13,
                  margin: 0,
                  fontStyle: "italic",
                }}
              >
                Started{" "}
                {formatDistanceToNow(liveSession.startedAt, {
                  addSuffix: true,
                })}
                {" · transcript streaming"}
              </p>
            </div>
            <div style={{ alignSelf: "center" }}>
              <Wave height={20} bars={6} />
            </div>
          </Link>
        ) : null}

        {pastSessions.length === 0 && !liveSession ? (
          <div
            style={{
              border: "0.5px dashed var(--rule)",
              padding: "60px 32px",
              textAlign: "center",
              color: "var(--bone-mute)",
              marginTop: 24,
            }}
          >
            <h3
              className="t-display"
              style={{ fontSize: 24, marginBottom: 10 }}
            >
              No sessions yet
            </h3>
            <p
              className="t-meta"
              style={{ maxWidth: 420, margin: "0 auto" }}
            >
              Use{" "}
              <code
                style={{
                  fontFamily: "var(--mono)",
                  color: "var(--copper)",
                }}
              >
                /grim start
              </code>{" "}
              in your Discord voice channel to begin recording.
            </p>
          </div>
        ) : null}

        {pastSessions.map((s) => {
          const summaryList = summariesBySession.get(s.id) ?? [];
          const latestSummary = summaryList[0];
          const title = deriveTitle(latestSummary?.text);
          const hook = deriveHook(latestSummary?.text);
          return (
            <Link
              key={s.id}
              href={`/account/c/${campaign.id}/sessions/${s.id}`}
              className="session-row"
              style={{
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div className="session-num">
                {String(s.id).padStart(2, "0")}
                <small>
                  {format(s.startedAt, "EEE").slice(0, 3).toLowerCase()}
                </small>
              </div>
              <div>
                <h3
                  style={{
                    fontFamily: "var(--serif)",
                    fontSize: 22,
                    margin: 0,
                    fontWeight: 500,
                    marginBottom: 6,
                    color: "var(--bone)",
                    fontVariationSettings: '"opsz" 144',
                  }}
                >
                  {title}
                </h3>
                {hook ? (
                  <p
                    style={{
                      color: "var(--bone-dim)",
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      margin: 0,
                      maxWidth: 600,
                    }}
                  >
                    {hook}
                  </p>
                ) : (
                  <p
                    className="t-meta"
                    style={{ margin: 0, fontStyle: "italic" }}
                  >
                    summary not available
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span className="t-meta">
                    {format(s.startedAt, "MMM d, yyyy")}
                  </span>
                  <span className="t-meta">·</span>
                  <span className="t-meta">
                    {durationLabel(s.startedAt, s.endedAt)}
                  </span>
                  {summaryList.length > 1 ? (
                    <>
                      <span className="t-meta">·</span>
                      <span className="t-meta t-meta--lit">
                        {summaryList.length} summary revisions
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <div
                style={{
                  alignSelf: "center",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <span className="t-meta">→</span>
              </div>
            </Link>
          );
        })}

        {pastSessions.length > 0 ? (
          <div
            style={{
              padding: "32px 0",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <Asterism />
            <span className="t-meta">
              end of chronicle
              {lastPlayed
                ? ` · last played ${formatDistanceToNow(lastPlayed, { addSuffix: true })}`
                : ""}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}
