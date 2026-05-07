import { desc, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Topbar } from "@/components/grimoire/primitives";
import { db } from "@/db";
import { campaigns, sessions, summaries } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { SessionsList } from "./sessions-list";

export default async function SessionsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);
  const guildMap = Object.fromEntries(userGuilds.map((g) => [g.id, g.name]));

  if (guildIds.length === 0) {
    return (
      <>
        <Topbar
          crumbs={[
            { label: "GRIMOIRE", href: "/account" },
            { label: "Sessions" },
          ]}
        />
        <div className="page" style={{ maxWidth: 1100 }}>
          <div
            style={{
              border: "0.5px dashed var(--rule)",
              padding: "60px 32px",
              textAlign: "center",
              background: "var(--ink-2)",
            }}
          >
            <h2
              className="t-display"
              style={{ fontSize: 32, marginBottom: 12 }}
            >
              No servers
            </h2>
            <p className="t-meta">
              No servers found where you are an administrator.
            </p>
          </div>
        </div>
      </>
    );
  }

  const [userSessions, userCampaigns] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(inArray(sessions.guildId, guildIds))
      .orderBy(desc(sessions.startedAt)),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        guildId: campaigns.guildId,
      })
      .from(campaigns)
      .where(inArray(campaigns.guildId, guildIds)),
  ]);

  const sessionIds = userSessions.map((s) => s.id);

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
          { label: "Sessions" },
        ]}
      />
      <div className="page" style={{ maxWidth: 1100 }}>
        <SessionsList
          sessions={userSessions}
          campaigns={userCampaigns}
          summariesBySession={summariesBySession}
          guildMap={guildMap}
        />
      </div>
    </>
  );
}
