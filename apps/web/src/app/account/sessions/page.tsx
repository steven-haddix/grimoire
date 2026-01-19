import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { db } from "@/db";
import { sessions, summaries } from "@/db/schema";
import { inArray, desc, eq } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { AlertCircle, Clock, Calendar } from "lucide-react";

export default async function SessionsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);
  const guildMap = new Map(userGuilds.map((g) => [g.id, g.name]));

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

  const userSessions = await db
    .select()
    .from(sessions)
    .where(inArray(sessions.guildId, guildIds))
    .orderBy(desc(sessions.startedAt));

  const sessionIds = userSessions.map((s) => s.id);
  
  const sessionSummaries =
    sessionIds.length > 0
      ? await db
          .select()
          .from(summaries)
          .where(inArray(summaries.sessionId, sessionIds))
          .orderBy(desc(summaries.createdAt))
      : [];

  const summariesBySession = new Map();
  for (const summary of sessionSummaries) {
    if (!summariesBySession.has(summary.sessionId)) {
      summariesBySession.set(summary.sessionId, []);
    }
    summariesBySession.get(summary.sessionId).push(summary);
  }

  const activeSessions = userSessions.filter((s) => s.status === "active");
  const pastSessions = userSessions.filter((s) => s.status !== "active");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Sessions</h1>
        <p className="text-muted-foreground">
          View active sessions and read summaries from past adventures.
        </p>
      </div>

      {activeSessions.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Active Now
            </h2>
          </div>
          <div className="grid gap-4">
            {activeSessions.map((s) => (
              <Card key={s.id} className="border-emerald-500/20 bg-emerald-500/5">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">
                        {guildMap.get(s.guildId) ?? "Unknown Guild"}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        Started {format(s.startedAt, "PPP p")}
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                      Live
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Recording in progress. Summaries will be generated when the session ends.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </h2>
        
        {pastSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No past sessions found.</p>
        ) : (
          <div className="grid gap-6">
            {pastSessions.map((s) => {
              const sessionSummaryList = summariesBySession.get(s.id) || [];
              const latestSummary = sessionSummaryList[0];

              return (
                <Card key={s.id} className="overflow-hidden">
                  <CardHeader className="bg-secondary/30 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-lg">
                          {guildMap.get(s.guildId) ?? "Unknown Guild"}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(s.startedAt, "PPP")}
                          {s.endedAt && ` • ${format(s.endedAt, "p")}`}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">
                        {s.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {latestSummary ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90">
                        <ReactMarkdown>{latestSummary.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No summary generated for this session.
                      </p>
                    )}
                    {sessionSummaryList.length > 1 && (
                      <p className="text-xs text-muted-foreground mt-4">
                        +{sessionSummaryList.length - 1} more updates
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
