import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds, invalidateUserAdminGuildsCache } from "@/lib/discord/server";
import { db } from "@/db";
import { campaigns, botGuilds } from "@/db/schema";
import { inArray, desc } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Map as MapIcon, Calendar, Compass, Shield, Users } from "lucide-react";
import { CreateCampaignDialog } from "@/components/create-campaign-dialog";
import { CampaignActions } from "@/components/campaign-actions";
import { format } from "date-fns";

interface CampaignsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function CampaignsPage(props: CampaignsPageProps) {
  const searchParams = await props.searchParams;

  if (searchParams.installed === "true") {
    await invalidateUserAdminGuildsCache();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const userGuilds = await getUserAdminGuilds();
  const guildIds = userGuilds.map((g) => g.id);

  if (guildIds.length === 0) {
    return (
      <Card className="w-full bg-card/40 border-dashed border-primary/30">
        <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="bg-primary/5 p-4 rounded-full mb-4">
            <AlertCircle className="h-12 w-12 text-primary/40" />
          </div>
          <h3 className="text-xl font-heading mb-2">No Kingdoms Found</h3>
          <p className="max-w-md text-center italic">
            It seems you have no administrative power in any discord servers. 
            Claim your throne as an administrator to begin your chronicle.
          </p>
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6 border-border/50">
        <div>
          <h1 className="text-4xl font-heading font-bold tracking-tight mb-2 text-primary">Campaigns</h1>
          <p className="text-muted-foreground text-lg italic contents-['—_']">
            Manage your realms and organize your heroic sessions.
          </p>
        </div>
        <div className="shrink-0">
          <CreateCampaignDialog guilds={userGuilds} />
        </div>
      </div>

      <div className="grid gap-8">
        {userGuilds.map((guild) => {
          const guildCampaigns = campaignsByGuild.get(guild.id) || [];
          const activeCampaignId = activeCampaignMap.get(guild.id);

          return (
            <section key={guild.id} className="space-y-6">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary opacity-70" />
                <h2 className="text-2xl font-heading font-semibold">
                  {guild.name}
                </h2>
                <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
              </div>
              
              {guildCampaigns.length === 0 ? (
                <Card className="bg-card/20 border-dashed border-primary/20">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                    <MapIcon className="h-10 w-10 mb-3 text-primary/30" />
                    <p className="font-heading text-base mb-1">Terra Incognita</p>
                    <p className="italic opacity-70">No campaigns have been chronicled in this realm yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {guildCampaigns.map((campaign) => {
                    const isActive = campaign.id === activeCampaignId;
                    
                    return (
                      <Card 
                        key={campaign.id} 
                        className={`group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                          isActive 
                            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" 
                            : "bg-card/40 hover:bg-card/80 border-border/60"
                        }`}
                      >
                        {isActive && (
                          <div className="absolute top-0 right-0">
                            <div className="bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider shadow-sm">
                              Active
                            </div>
                          </div>
                        )}
                        
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-lg font-heading group-hover:text-primary transition-colors truncate" title={campaign.name}>
                              {campaign.name}
                            </CardTitle>
                          </div>
                          <CardDescription className="line-clamp-2 h-10 text-sm italic opacity-80">
                            {campaign.description || "The story is yet to be written..."}
                          </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30">
                              <Calendar className="h-3.5 w-3.5 text-primary/60" />
                              <span>{format(campaign.createdAt, "MMM d, yyyy")}</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/30">
                              <Compass className="h-3.5 w-3.5 text-primary/60" />
                              <span>Region: TBA</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between pt-2">
                            <CampaignActions 
                              campaignId={campaign.id} 
                              guildId={guild.id} 
                              isActive={isActive} 
                            />
                            
                            {isActive && (
                              <div className="flex items-center gap-2 text-primary font-medium text-[10px] uppercase tracking-wider opacity-70">
                                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                Live
                              </div>
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
