import { format, formatDistanceToNow } from "date-fns";
import { and, count, desc, eq, inArray, max } from "drizzle-orm";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CampaignActions } from "@/components/campaign-actions";
import { Asterism } from "@/components/grimoire/marks";
import {
  Cartouche,
  GridUnderlay,
  Pulse,
  RailSection,
  Stat,
  StatusLine,
  Topbar,
  Wave,
} from "@/components/grimoire/primitives";
import { Badge } from "@/components/ui/badge";
import { CreateIllustrationDialog } from "./illustrations/illustrations-view";
import { db } from "@/db";
import {
  botGuilds,
  campaigns,
  illustrations,
  memories,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";

interface CampaignPageProps {
  params: Promise<{ guildId: string; id: string }>;
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
  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith(">")) continue;
    if (line.startsWith("-") || line.startsWith("*")) continue;
    if (line.length < 16) continue;
    return line.length > 220 ? `${line.slice(0, 220)}…` : line;
  }
  return null;
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

function totalHours(rows: { startedAt: Date; endedAt: Date | null }[]) {
  let ms = 0;
  for (const r of rows) {
    if (r.endedAt) ms += r.endedAt.getTime() - r.startedAt.getTime();
  }
  return ms / 1000 / 60 / 60;
}

export default async function CampaignDetailPage(props: CampaignPageProps) {
  const params = await props.params;
  const guildId = params.guildId;
  const campaignId = parseInt(params.id, 10);
  if (Number.isNaN(campaignId)) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guild = userGuilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) notFound();

  // Campaign must belong to this server scope
  if (campaign.guildId !== guildId) {
    redirect(`/account/s/${campaign.guildId}/campaigns/${campaign.id}`);
  }

  const guildName = guild.name;

  const guildSettings = await db.query.botGuilds.findFirst({
    where: eq(botGuilds.guildId, campaign.guildId),
  });
  const isActive = guildSettings?.activeCampaignId === campaign.id;

  const campaignSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.campaignId, campaignId))
    .orderBy(desc(sessions.startedAt));

  const sessionIds = campaignSessions.map((s) => s.id);

  const [
    sessionSummaries,
    speakerCountRows,
    transcriptCountRows,
    memoryCountRows,
    recentMemories,
    liveSessionRows,
    latestIllustrationRows,
    illustrationCountRows,
  ] = await Promise.all([
    sessionIds.length > 0
      ? db
          .select()
          .from(summaries)
          .where(inArray(summaries.sessionId, sessionIds))
          .orderBy(desc(summaries.createdAt))
      : Promise.resolve([] as Array<typeof summaries.$inferSelect>),
    sessionIds.length > 0
      ? db
          .selectDistinct({ speaker: transcripts.speaker })
          .from(transcripts)
          .where(inArray(transcripts.sessionId, sessionIds))
      : Promise.resolve([] as Array<{ speaker: string }>),
    sessionIds.length > 0
      ? db
          .select({ value: count() })
          .from(transcripts)
          .where(inArray(transcripts.sessionId, sessionIds))
      : Promise.resolve([{ value: 0 }] as Array<{ value: number }>),
    db
      .select({ value: count() })
      .from(memories)
      .where(eq(memories.campaignId, campaignId)),
    db
      .select()
      .from(memories)
      .where(eq(memories.campaignId, campaignId))
      .orderBy(desc(memories.createdAt))
      .limit(4),
    db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.campaignId, campaignId),
          eq(sessions.status, "active"),
        ),
      )
      .orderBy(desc(sessions.startedAt))
      .limit(1),
    db
      .select({
        id: illustrations.id,
        caption: illustrations.caption,
        createdAt: illustrations.createdAt,
        sessionId: illustrations.sessionId,
      })
      .from(illustrations)
      .where(eq(illustrations.campaignId, campaignId))
      .orderBy(desc(illustrations.createdAt))
      .limit(1),
    db
      .select({ value: count() })
      .from(illustrations)
      .where(eq(illustrations.campaignId, campaignId)),
  ]);

  const summariesBySession = new Map<number, typeof sessionSummaries>();
  for (const s of sessionSummaries) {
    const list = summariesBySession.get(s.sessionId) ?? [];
    list.push(s);
    summariesBySession.set(s.sessionId, list);
  }

  const liveSession = liveSessionRows[0] ?? null;
  const pastSessions = campaignSessions.filter((s) => s.status !== "active");

  const latestIllustration = latestIllustrationRows[0] ?? null;

  const stats = {
    sessions: campaignSessions.length,
    hours: totalHours(campaignSessions),
    speakers: speakerCountRows.length,
    transcriptLines: transcriptCountRows[0]?.value ?? 0,
    memories: memoryCountRows[0]?.value ?? 0,
    illustrations: illustrationCountRows[0]?.value ?? 0,
  };

  const lastPlayed = campaignSessions[0]?.startedAt ?? null;
  const folioNumber = String(stats.sessions).padStart(3, "0");
  const latestSummaryByDate = sessionSummaries[0] ?? null;

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: guildName, href: `/account/s/${guildId}/campaigns` },
          {
            label: "Campaigns",
            href: `/account/s/${guildId}/campaigns`,
          },
          { label: campaign.name },
        ]}
        right={
          <CampaignActions
            campaign={campaign}
            guildId={campaign.guildId}
            isActive={isActive}
          />
        }
      />

      <div style={{ position: "relative" }}>
        <GridUnderlay />
        <div className="page" style={{ position: "relative", zIndex: 1 }}>
          {/* HEADER CARTOUCHE */}
          <Cartouche style={{ marginBottom: 48 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  liveSession || speakerCountRows.length > 0
                    ? "1fr 320px"
                    : "1fr",
                gap: 48,
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    marginBottom: 18,
                    flexWrap: "wrap",
                  }}
                >
                  {liveSession ? (
                    <Badge variant="lit">
                      <Pulse /> session in progress
                    </Badge>
                  ) : isActive ? (
                    <Badge variant="lit">
                      <Pulse /> active campaign
                    </Badge>
                  ) : null}
                  <span className="t-meta">
                    FOLIO {folioNumber} · {guildName}
                  </span>
                </div>
                <h1
                  className="t-display"
                  style={{
                    fontSize: "clamp(48px, 7vw, 84px)",
                    marginBottom: 18,
                  }}
                >
                  {renderTitleWithEm(campaign.name)}
                </h1>
                <p
                  style={{
                    color: "var(--bone-dim)",
                    fontSize: 16,
                    lineHeight: 1.55,
                    margin: 0,
                    maxWidth: 600,
                  }}
                >
                  {campaign.description ??
                    "The story is yet to be written. Start a session in your Discord and Grimoire will begin chronicling."}
                </p>

                <div
                  style={{
                    display: "flex",
                    gap: 36,
                    marginTop: 28,
                    flexWrap: "wrap",
                  }}
                >
                  <Stat label="Sessions" value={stats.sessions} />
                  <Stat
                    label="Hours played"
                    value={
                      stats.hours >= 10
                        ? Math.round(stats.hours)
                        : stats.hours.toFixed(1)
                    }
                  />
                  <Stat label="Speakers" value={stats.speakers} />
                  <Stat
                    label="Transcript lines"
                    value={stats.transcriptLines}
                  />
                  <Stat label="Memories" value={stats.memories} />
                  <Stat
                    label="Illustrations"
                    value={stats.illustrations}
                  />
                </div>
              </div>

              {speakerCountRows.length > 0 ? (
                <div>
                  <div className="t-eyebrow" style={{ marginBottom: 12 }}>
                    The party
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    {speakerCountRows.slice(0, 6).map((p) => (
                      <div
                        key={p.speaker}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            border: "0.5px solid var(--rule)",
                            display: "grid",
                            placeItems: "center",
                            fontFamily: "var(--serif)",
                            fontSize: 14,
                            color: "var(--copper)",
                            fontVariationSettings: '"opsz" 144',
                            flexShrink: 0,
                          }}
                        >
                          {p.speaker.slice(0, 1).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: "var(--serif)",
                              fontSize: 15,
                              color: "var(--bone)",
                              fontVariationSettings: '"opsz" 144',
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.speaker}
                          </div>
                          <div className="t-meta">heard in transcripts</div>
                        </div>
                      </div>
                    ))}
                    {speakerCountRows.length > 6 ? (
                      <div className="t-meta">
                        + {speakerCountRows.length - 6} more
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </Cartouche>

          {/* TWO-COL: SESSIONS + RAIL */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 300px",
              gap: 56,
            }}
            className="campaign-body"
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 18,
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <h2
                  className="t-display"
                  style={{ fontSize: 32, fontWeight: 500 }}
                >
                  Sessions
                </h2>
                <span className="t-meta">
                  {pastSessions.length} logged
                  {liveSession ? " · 1 in progress" : null}
                </span>
              </div>

              <div className="rule" style={{ marginBottom: 4 }} />

              {liveSession ? (
                <Link
                  href={`/account/s/${guildId}/campaigns/${campaign.id}/live`}
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
                    {String(stats.sessions).padStart(2, "0")}
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
                  <p className="t-meta" style={{ maxWidth: 420, margin: "0 auto" }}>
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
                    href={`/account/s/${guildId}/sessions/${s.id}`}
                    className="session-row"
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div className="session-num">
                      {String(s.id).padStart(2, "0")}
                      <small>
                        {format(s.startedAt, "EEE")
                          .slice(0, 3)
                          .toLowerCase()}
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
                    end of chronicle{lastPlayed
                      ? ` · last played ${formatDistanceToNow(lastPlayed, { addSuffix: true })}`
                      : ""}
                  </span>
                </div>
              ) : null}
            </div>

            {/* RAIL */}
            <aside>
              <div
                style={{
                  position: "sticky",
                  top: 90,
                  display: "flex",
                  flexDirection: "column",
                  gap: 32,
                }}
              >
                <RailSection
                  title="Latest illustration"
                  link={
                    <Link
                      href={`/account/s/${guildId}/campaigns/${campaign.id}/illustrations`}
                      className="t-meta t-meta--lit"
                      style={{ textDecoration: "none" }}
                    >
                      view all →
                    </Link>
                  }
                >
                  {latestIllustration ? (
                    <Link
                      href={`/account/s/${guildId}/campaigns/${campaign.id}/illustrations`}
                      style={{
                        display: "block",
                        position: "relative",
                        aspectRatio: "4 / 5",
                        border: "0.5px solid var(--rule)",
                        background: "var(--ink-2)",
                        overflow: "hidden",
                        marginBottom: 8,
                      }}
                    >
                      {/* biome-ignore lint/performance/noImgElement: same-origin API endpoint */}
                      <img
                        src={`/api/illustrations/${latestIllustration.id}/image`}
                        alt={latestIllustration.caption ?? "Latest illustration"}
                        loading="lazy"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </Link>
                  ) : (
                    <div
                      style={{
                        position: "relative",
                        aspectRatio: "4 / 5",
                        border: "0.5px dashed var(--rule)",
                        background: "var(--ink-2)",
                        display: "grid",
                        placeItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <span className="t-meta" style={{ fontSize: 9.5, textAlign: "center", padding: "0 16px" }}>
                        no scenes painted yet
                      </span>
                    </div>
                  )}
                  <div className="t-meta" style={{ marginBottom: 12 }}>
                    {latestIllustration?.caption ?? null}
                  </div>
                  <CreateIllustrationDialog campaignId={campaign.id} size="sm">
                    Conjure new scene
                  </CreateIllustrationDialog>
                </RailSection>

                {latestSummaryByDate ? (
                  <RailSection
                    title="Latest summary"
                    link={
                      <Link
                        href={`/account/s/${guildId}/sessions/${latestSummaryByDate.sessionId}`}
                        className="t-meta t-meta--lit"
                        style={{ textDecoration: "none" }}
                      >
                        view session →
                      </Link>
                    }
                  >
                    <div
                      style={{
                        fontFamily: "var(--serif)",
                        fontSize: 15,
                        color: "var(--bone)",
                        lineHeight: 1.4,
                        marginBottom: 8,
                      }}
                    >
                      {deriveTitle(latestSummaryByDate.text)}
                    </div>
                    <p
                      style={{
                        color: "var(--bone-dim)",
                        fontSize: 13,
                        lineHeight: 1.55,
                        margin: 0,
                      }}
                    >
                      {deriveHook(latestSummaryByDate.text) ??
                        "No preview available."}
                    </p>
                    <div className="t-meta" style={{ marginTop: 10 }}>
                      Generated{" "}
                      {formatDistanceToNow(latestSummaryByDate.createdAt, {
                        addSuffix: true,
                      })}
                    </div>
                  </RailSection>
                ) : null}

                {recentMemories.length > 0 ? (
                  <RailSection
                    title="Recent memories"
                    link={
                      <Link
                        href={`/account/s/${guildId}/campaigns/${campaign.id}/memories`}
                        className="t-meta t-meta--lit"
                        style={{ textDecoration: "none" }}
                      >
                        browse all →
                      </Link>
                    }
                  >
                    {recentMemories.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          padding: "10px 0",
                          borderBottom: "0.5px dotted var(--rule-soft)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <Badge
                            variant={
                              memoryVariant(m.category) as
                                | "lore"
                                | "character"
                                | "rule"
                                | "meta"
                                | "other"
                            }
                            style={{ fontSize: 8.5, padding: "2px 6px" }}
                          >
                            {m.category}
                          </Badge>
                          <span
                            style={{
                              fontFamily: "var(--serif)",
                              fontSize: 14,
                              color: "var(--bone)",
                              fontVariationSettings: '"opsz" 144',
                            }}
                          >
                            {firstSentence(m.content)}
                          </span>
                        </div>
                        <span className="t-meta" style={{ fontSize: 10.5 }}>
                          {format(m.createdAt, "MMM d, yyyy")}
                        </span>
                      </div>
                    ))}
                  </RailSection>
                ) : null}

                <RailSection title="Bot status">
                  <StatusLine
                    label="Active campaign"
                    value={isActive ? "this one" : "another"}
                    lit={isActive}
                  />
                  <StatusLine
                    label="Live session"
                    value={liveSession ? "recording now" : "—"}
                    lit={Boolean(liveSession)}
                  />
                  <StatusLine
                    label="Last played"
                    value={
                      lastPlayed
                        ? formatDistanceToNow(lastPlayed, { addSuffix: true })
                        : "never"
                    }
                  />
                  {!isActive ? (
                    <p
                      className="t-meta"
                      style={{ marginTop: 12, lineHeight: 1.5 }}
                    >
                      Use the actions menu in the top bar to set this
                      campaign as active.
                    </p>
                  ) : null}
                </RailSection>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

function memoryVariant(category: string): string {
  if (["lore", "character", "rule", "meta"].includes(category))
    return category;
  return "other";
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 80) return trimmed;
  const cut = trimmed.slice(0, 80);
  const period = cut.lastIndexOf(".");
  if (period > 30) return `${cut.slice(0, period + 1)}`;
  return `${cut}…`;
}

// Heuristic: italicize a word in the campaign title if it has 2+ words,
// to recreate the design's "The _Long_ Thaw" effect. Otherwise return as-is.
function renderTitleWithEm(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return name;
  // pick the last word that isn't tiny
  let idx = words.length - 1;
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (w && w.length > 3) {
      idx = i;
      break;
    }
  }
  const emWord = words[idx] ?? "";
  return (
    <>
      {words.slice(0, idx).join(" ")}
      {idx > 0 ? " " : ""}
      <em>{emWord}</em>
      {idx < words.length - 1 ? ` ${words.slice(idx + 1).join(" ")}` : ""}
    </>
  );
}
