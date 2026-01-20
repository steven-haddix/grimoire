import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { db } from "@/db";
import { campaigns, botGuilds } from "@/db/schema";
import { inArray, desc } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Map as MapIcon, Calendar } from "lucide-react";
import { CreateCampaignDialog } from "@/components/create-campaign-dialog";
import { SetActiveButton } from "@/components/campaign-actions";
import { format } from "date-fns";

export default async function CampaignsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);

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

  // Fetch campaigns
  const allCampaigns = await db
    .select()
    .from(campaigns)
    .where(inArray(campaigns.guildId, guildIds))
    .orderBy(desc(campaigns.updatedAt));

  // Fetch active campaign info from botGuilds
  const guildsSettings = await db
    .select()
    .from(botGuilds)
    .where(inArray(botGuilds.guildId, guildIds));
    
  const activeCampaignMap = new Map(guildsSettings.map(g => [g.guildId, g.activeCampaignId]));

  const campaignsByGuild = new Map<string, typeof allCampaigns>();
  
  // Initialize for all guilds to show empty states if needed
  guildIds.forEach(id => campaignsByGuild.set(id, []));

  for (const campaign of allCampaigns) {
    campaignsByGuild.get(campaign.guildId)?.push(campaign);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Campaigns</h1>
          <p className="text-muted-foreground">
            Manage your campaigns and organize your sessions.
          </p>
        </div>
        <CreateCampaignDialog guilds={userGuilds} />
      </div>

      <div className="grid gap-8">
        {userGuilds.map((guild) => {
          const guildCampaigns = campaignsByGuild.get(guild.id) || [];
          const activeCampaignId = activeCampaignMap.get(guild.id);

          return (
            <section key={guild.id} className="space-y-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {guild.name}
              </h2>
              
              {guildCampaigns.length === 0 ? (
                <Card className="bg-muted/50 border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
                    <MapIcon className="h-8 w-8 mb-2 opacity-50" />
                    <p>No campaigns yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {guildCampaigns.map((campaign) => {
                    const isActive = campaign.id === activeCampaignId;
                    
                    return (
                      <Card key={campaign.id} className={isActive ? "border-emerald-500/50 bg-emerald-500/5" : ""}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base truncate" title={campaign.name}>
                              {campaign.name}
                            </CardTitle>
                            {isActive && (
                              <Badge className="bg-emerald-500 hover:bg-emerald-600">Active</Badge>
                            )}
                          </div>
                          <CardDescription className="line-clamp-2 h-10 text-xs">
                            {campaign.description || "No description provided."}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center justify-between mt-2">
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(campaign.createdAt, "MMM d, yyyy")}
                            </div>
                            
                            {!isActive && (
                              <SetActiveButton campaignId={campaign.id} guildId={guild.id} />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
