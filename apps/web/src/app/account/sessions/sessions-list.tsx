"use client";

import { useState } from "react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Clock, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Session {
  id: number;
  guildId: string;
  channelId: string;
  campaignId: number | null;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
}

interface Campaign {
  id: number;
  name: string;
  guildId: string;
}

interface Summary {
  id: number;
  sessionId: number;
  text: string;
  createdAt: Date;
}

interface SessionsListProps {
  sessions: Session[];
  campaigns: Campaign[];
  summariesBySession: Record<number, Summary[]>;
  guildMap: Record<string, string>;
}

export function SessionsList({
  sessions,
  campaigns,
  summariesBySession,
  guildMap,
}: SessionsListProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("all");

  const filteredSessions =
    selectedCampaignId === "all"
      ? sessions
      : sessions.filter(
          (s) => s.campaignId === parseInt(selectedCampaignId, 10)
        );

  const activeSessions = filteredSessions.filter((s) => s.status === "active");
  const pastSessions = filteredSessions.filter((s) => s.status !== "active");

  const campaignMap = new Map(campaigns.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Sessions</h1>
          <p className="text-muted-foreground">
            View active sessions and read summaries from past adventures.
          </p>
        </div>
        {campaigns.length > 0 && (
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Campaigns</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id.toString()}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
              <Card
                key={s.id}
                className="border-emerald-500/20 bg-emerald-500/5"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">
                          {guildMap[s.guildId] ?? "Unknown Guild"}
                        </CardTitle>
                        {s.campaignId && campaignMap.has(s.campaignId) && (
                          <Badge variant="outline" className="text-xs">
                            {campaignMap.get(s.campaignId)}
                          </Badge>
                        )}
                      </div>
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
          History
        </h2>

        {pastSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            {selectedCampaignId === "all"
              ? "No past sessions found."
              : "No past sessions found for this campaign."}
          </p>
        ) : (
          <div className="grid gap-6">
            {pastSessions.map((s) => {
              const sessionSummaryList = summariesBySession[s.id] || [];
              const latestSummary = sessionSummaryList[0];

              return (
                <Card key={s.id} className="overflow-hidden">
                  <CardHeader className="bg-secondary/30 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">
                            {guildMap[s.guildId] ?? "Unknown Guild"}
                          </CardTitle>
                          {s.campaignId && campaignMap.has(s.campaignId) && (
                            <Badge variant="outline" className="text-xs">
                              {campaignMap.get(s.campaignId)}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(s.startedAt, "PPP")}
                          {s.endedAt && ` • ${format(s.endedAt, "p")}`}
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
