import { NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, botGuilds } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const guildId = searchParams.get("guildId");

  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }

  const list = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.guildId, guildId))
    .orderBy(desc(campaigns.updatedAt));

  const guildSettings = await db.query.botGuilds.findFirst({
    where: eq(botGuilds.guildId, guildId),
  });

  return NextResponse.json({
    campaigns: list,
    activeCampaignId: guildSettings?.activeCampaignId,
  });
}

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.guildId || !body.name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const [newCampaign] = await db
    .insert(campaigns)
    .values({
      guildId: body.guildId,
      name: body.name,
      description: body.description,
    })
    .returning();

  if (!newCampaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  // If no active campaign, set this one?
  const guildSettings = await db.query.botGuilds.findFirst({
    where: eq(botGuilds.guildId, body.guildId),
  });

  if (guildSettings && !guildSettings.activeCampaignId) {
    await db
      .update(botGuilds)
      .set({ activeCampaignId: newCampaign.id })
      .where(eq(botGuilds.guildId, body.guildId));
  }

  return NextResponse.json(newCampaign);
}
