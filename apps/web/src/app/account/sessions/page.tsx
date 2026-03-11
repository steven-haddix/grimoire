import { desc, inArray } from "drizzle-orm";
import { AlertCircle } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { campaigns, sessionNotes, sessions, summaries } from "@/db/schema";
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
      <Card className="w-full bg-card/80">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertCircle className="h-10 w-10 mb-4 opacity-50" />
          <p>No servers found where you are an administrator.</p>
        </CardContent>
      </Card>
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

  const notes =
    sessionIds.length > 0
      ? await db
          .select()
          .from(sessionNotes)
          .where(inArray(sessionNotes.sessionId, sessionIds))
          .orderBy(desc(sessionNotes.createdAt))
      : [];

  const summariesBySession: Record<number, typeof sessionSummaries> = {};
  for (const summary of sessionSummaries) {
    const list = summariesBySession[summary.sessionId] ?? [];
    list.push(summary);
    summariesBySession[summary.sessionId] = list;
  }

  const notesBySession: Record<number, typeof notes> = {};
  for (const note of notes) {
    const list = notesBySession[note.sessionId] ?? [];
    list.push(note);
    notesBySession[note.sessionId] = list;
  }

  return (
    <SessionsList
      sessions={userSessions}
      campaigns={userCampaigns}
      summariesBySession={summariesBySession}
      notesBySession={notesBySession}
      guildMap={guildMap}
      guilds={userGuilds.map((guild) => ({ id: guild.id, name: guild.name }))}
    />
  );
}
