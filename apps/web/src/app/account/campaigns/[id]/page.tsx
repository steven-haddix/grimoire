import { format } from "date-fns";
import { desc, eq, inArray } from "drizzle-orm";
import { AlertCircle, ArrowLeft, Calendar, Clock } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CampaignActions } from "@/components/campaign-actions";
import { ExpandableDescription } from "./expandable-description";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { botGuilds, campaigns, sessions, summaries } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";

interface CampaignPageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignPage(props: CampaignPageProps) {
  const params = await props.params;
  const campaignId = parseInt(params.id, 10);

  if (Number.isNaN(campaignId)) {
    notFound();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);

  // Fetch campaign
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });

  if (!campaign) {
    notFound();
  }

  // Verify access
  if (!guildIds.includes(campaign.guildId)) {
    return (
      <Card className="w-full bg-destructive/10 border-destructive/20">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <AlertCircle className="h-10 w-10 mb-4 opacity-50 text-destructive" />
          <p>You do not have permission to view this campaign.</p>
        </CardContent>
      </Card>
    );
  }

  const guildName =
    userGuilds.find((g) => g.id === campaign.guildId)?.name || "Unknown Guild";

  // Check if active
  const guildSettings = await db.query.botGuilds.findFirst({
    where: eq(botGuilds.guildId, campaign.guildId),
  });
  const isActive = guildSettings?.activeCampaignId === campaign.id;

  // Fetch sessions
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

  const summariesBySession = new Map();
  for (const summary of sessionSummaries) {
    if (!summariesBySession.has(summary.sessionId)) {
      summariesBySession.set(summary.sessionId, []);
    }
    summariesBySession.get(summary.sessionId).push(summary);
  }

  const activeSessions = campaignSessions.filter((s) => s.status === "active");
  const pastSessions = campaignSessions.filter((s) => s.status !== "active");

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" asChild className="mt-1">
          <Link href="/account/campaigns">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to campaigns</span>
          </Link>
        </Button>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-heading font-bold tracking-tight text-primary">
                {campaign.name}
              </h1>
              {isActive && (
                <Badge
                  variant="outline"
                  className="border-primary/50 text-primary bg-primary/10"
                >
                  Active Campaign
                </Badge>
              )}
            </div>
            <CampaignActions
              campaign={campaign}
              guildId={campaign.guildId}
              isActive={isActive}
            />
          </div>
          <ExpandableDescription description={campaign.description} />
          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
            <Badge variant="secondary" className="text-xs">
              {guildName}
            </Badge>
            <span>•</span>
            <span>Created {format(campaign.createdAt, "PPP")}</span>
          </div>
        </div>
      </div>

      <div className="h-px w-full bg-border/50" />

      {activeSessions.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Active Session
            </h2>
          </div>
          <div className="grid gap-4">
            {activeSessions.map((s) => (
              <Card
                key={s.id}
                className="border-emerald-500/20 bg-emerald-500/5"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">
                        Session in Progress
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        Started {format(s.startedAt, "PPP p")}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                    >
                      Live
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Recording in progress. Summaries will be generated when the
                    session ends.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Session History
        </h2>

        {pastSessions.length === 0 ? (
          <Card className="bg-card/40 border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Calendar className="h-10 w-10 mb-3 opacity-30" />
              <p>No past sessions recorded for this campaign.</p>
            </CardContent>
          </Card>
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
                          Session - {format(s.startedAt, "MMM d, yyyy")}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Clock className="h-3.5 w-3.5" />
                          {format(s.startedAt, "p")}
                          {s.endedAt && ` - ${format(s.endedAt, "p")}`}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">{s.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {latestSummary ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ node, ...props }) => (
                              <h1
                                className="text-xl font-bold mt-6 mb-4 text-primary"
                                {...props}
                              />
                            ),
                            h2: ({ node, ...props }) => (
                              <h2
                                className="text-lg font-bold mt-5 mb-3 text-foreground"
                                {...props}
                              />
                            ),
                            h3: ({ node, ...props }) => (
                              <h3
                                className="text-base font-semibold mt-4 mb-2 text-foreground/90"
                                {...props}
                              />
                            ),
                            ul: ({ node, ...props }) => (
                              <ul
                                className="list-disc pl-6 mb-4 space-y-1"
                                {...props}
                              />
                            ),
                            ol: ({ node, ...props }) => (
                              <ol
                                className="list-decimal pl-6 mb-4 space-y-1"
                                {...props}
                              />
                            ),
                            li: ({ node, ...props }) => (
                              <li className="pl-1" {...props} />
                            ),
                            blockquote: ({ node, ...props }) => (
                              <blockquote
                                className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-4"
                                {...props}
                              />
                            ),
                            code: ({ node, ...props }) => (
                              <code
                                className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground"
                                {...props}
                              />
                            ),
                          }}
                        >
                          {latestSummary.text}
                        </ReactMarkdown>
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
