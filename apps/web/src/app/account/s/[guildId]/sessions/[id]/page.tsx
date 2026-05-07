import { format } from "date-fns";
import { asc, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Asterism } from "@/components/grimoire/marks";
import { Topbar } from "@/components/grimoire/primitives";
import { db } from "@/db";
import {
  campaigns,
  illustrations,
  memories,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { SessionDetail } from "./session-detail";

interface SessionPageProps {
  params: Promise<{ guildId: string; id: string }>;
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
    return line.length > 280 ? `${line.slice(0, 280)}…` : line;
  }
  return null;
}

export default async function SessionPage(props: SessionPageProps) {
  const params = await props.params;
  const guildId = params.guildId;
  const sessionId = parseInt(params.id, 10);
  if (Number.isNaN(sessionId)) notFound();

  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guild = userGuilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!session) notFound();
  if (session.guildId !== guildId) {
    redirect(`/account/s/${session.guildId}/sessions/${session.id}`);
  }

  const campaign = session.campaignId
    ? await db.query.campaigns.findFirst({
        where: eq(campaigns.id, session.campaignId),
      })
    : null;

  const guildName = guild.name;

  const [
    sessionSummaries,
    sessionTranscripts,
    capturedMemories,
    sessionIllustrations,
  ] = await Promise.all([
    db
      .select()
      .from(summaries)
      .where(eq(summaries.sessionId, sessionId))
      .orderBy(desc(summaries.createdAt)),
    db
      .select()
      .from(transcripts)
      .where(eq(transcripts.sessionId, sessionId))
      .orderBy(asc(transcripts.timestamp)),
    session.campaignId
      ? db
          .select()
          .from(memories)
          .where(eq(memories.campaignId, session.campaignId))
          .orderBy(desc(memories.createdAt))
      : Promise.resolve([] as Array<typeof memories.$inferSelect>),
    db
      .select({
        id: illustrations.id,
        caption: illustrations.caption,
        userPrompt: illustrations.userPrompt,
        createdAt: illustrations.createdAt,
        source: illustrations.source,
      })
      .from(illustrations)
      .where(eq(illustrations.sessionId, sessionId))
      .orderBy(desc(illustrations.createdAt)),
  ]);

  const latestSummary = sessionSummaries[0];
  const title = deriveTitle(latestSummary?.text);
  const hook = deriveHook(latestSummary?.text);

  const speakerSet = new Set(sessionTranscripts.map((t) => t.speaker));

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: guildName, href: `/account/s/${guildId}/campaigns` },
          campaign
            ? {
                label: campaign.name,
                href: `/account/s/${guildId}/campaigns/${campaign.id}`,
              }
            : {
                label: "Sessions",
                href: `/account/s/${guildId}/sessions`,
              },
          { label: `Session #${session.id}` },
        ]}
      />

      <div className="page">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 1fr auto",
            gap: 32,
            alignItems: "start",
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                border: "0.5px solid var(--copper-dim)",
                padding: "10px 0",
                textAlign: "center",
                fontFamily: "var(--serif)",
                fontSize: 36,
                color: "var(--copper)",
                lineHeight: 1,
                fontVariationSettings: '"opsz" 144',
              }}
            >
              #{session.id}
            </div>
            <div
              className="t-meta"
              style={{ textAlign: "center", marginTop: 6 }}
            >
              session
            </div>
          </div>
          <div>
            <div className="t-eyebrow" style={{ marginBottom: 10 }}>
              {format(session.startedAt, "MMM d, yyyy")} ·{" "}
              {format(session.startedAt, "EEEE")} ·{" "}
              {durationLabel(session.startedAt, session.endedAt)}
              {speakerSet.size > 0 ? ` · ${speakerSet.size} speakers` : null}
            </div>
            <h1
              className="t-display"
              style={{ fontSize: "clamp(36px, 5vw, 56px)", margin: 0 }}
            >
              {title}
            </h1>
            {hook ? (
              <p
                style={{
                  color: "var(--bone-dim)",
                  fontSize: 15,
                  marginTop: 14,
                  maxWidth: 720,
                  lineHeight: 1.6,
                }}
              >
                {hook}
              </p>
            ) : null}
          </div>
        </div>

        <div className="rule-double" style={{ margin: "32px 0 0" }} />

        <SessionDetail
          summary={latestSummary?.text ?? null}
          summaryRevisions={sessionSummaries.length}
          summaryUpdatedAt={latestSummary?.createdAt ?? null}
          transcripts={sessionTranscripts.map((t) => ({
            id: t.id,
            timestamp: t.timestamp,
            speaker: t.speaker,
            content: t.content,
          }))}
          memories={capturedMemories.map((m) => ({
            id: m.id,
            content: m.content,
            category: m.category,
            createdAt: m.createdAt,
            source: m.source,
          }))}
          illustrations={sessionIllustrations.map((i) => ({
            id: i.id,
            caption: i.caption,
            userPrompt: i.userPrompt,
            source: i.source,
            createdAt: i.createdAt,
          }))}
          sessionStartedAt={session.startedAt}
          sessionEndedAt={session.endedAt}
        />

        <div
          style={{
            marginTop: 48,
            padding: "20px 0",
            borderTop: "0.5px solid var(--rule-soft)",
            display: "flex",
            gap: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Asterism />
          <span className="t-meta">end of session</span>
          {campaign ? (
            <>
              <span className="t-meta">·</span>
              <Link
                href={`/account/s/${guildId}/campaigns/${campaign.id}`}
                className="t-meta t-meta--lit"
                style={{ textDecoration: "none" }}
              >
                back to {campaign.name} →
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
