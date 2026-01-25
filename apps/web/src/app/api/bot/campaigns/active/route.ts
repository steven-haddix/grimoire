import { NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, botGuilds } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.guildId || !body.name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Find campaign by name and guild
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.guildId, body.guildId), eq(campaigns.name, body.name)),
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  await db
    .update(botGuilds)
    .set({ activeCampaignId: campaign.id })
    .where(eq(botGuilds.guildId, body.guildId));

  return NextResponse.json({ success: true, campaign });
}
