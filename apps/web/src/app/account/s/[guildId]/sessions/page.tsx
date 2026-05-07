import { desc, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/grimoire/primitives";
import { db } from "@/db";
import { campaigns, sessions, summaries } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { ScopedSessionsList } from "./sessions-list";

interface ScopedSessionsPageProps {
  params: Promise<{ guildId: string }>;
}

export default async function ScopedSessionsPage(
  props: ScopedSessionsPageProps,
) {
  const { guildId } = await props.params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guild = userGuilds.find((g) => g.id === guildId);
  if (!guild) notFound();

  const [guildSessions, guildCampaigns] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(eq(sessions.guildId, guildId))
      .orderBy(desc(sessions.startedAt)),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
      })
      .from(campaigns)
      .where(eq(campaigns.guildId, guildId)),
  ]);

  const sessionIds = guildSessions.map((s) => s.id);
  const sessionSummaries =
    sessionIds.length > 0
      ? await db
          .select()
          .from(summaries)
          .where(inArray(summaries.sessionId, sessionIds))
          .orderBy(desc(summaries.createdAt))
      : [];

  const summariesBySession: Record<number, typeof sessionSummaries> = {};
  for (const summary of sessionSummaries) {
    const list = summariesBySession[summary.sessionId] ?? [];
    list.push(summary);
    summariesBySession[summary.sessionId] = list;
  }

  return (
    <>
      <Topbar
        crumbs={[
          { label: "GRIMOIRE", href: "/account" },
          { label: guild.name, href: `/account/s/${guildId}/campaigns` },
          { label: "Sessions" },
        ]}
      />
      <div className="page" style={{ maxWidth: 1100 }}>
        <ScopedSessionsList
          sessions={guildSessions}
          campaigns={guildCampaigns}
          summariesBySession={summariesBySession}
          guildId={guildId}
          guildName={guild.name}
        />
      </div>
    </>
  );
}
