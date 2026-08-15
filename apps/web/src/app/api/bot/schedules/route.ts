import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { botGuilds } from "@/db/schema";
import {
  getCampaignSchedule,
  getGuildSchedule,
  removeGuildSchedules,
  setCampaignSchedule,
} from "@/lib/scheduling/schedules";

function authorized(req: Request) {
  return req.headers.get("x-bot-secret") === process.env.BOT_SECRET;
}

async function activeCampaignId(guildId: string) {
  const guild = await db.query.botGuilds.findFirst({
    where: eq(botGuilds.guildId, guildId),
    columns: { activeCampaignId: true },
  });
  return guild?.activeCampaignId ?? null;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const guildId = new URL(req.url).searchParams.get("guildId")?.trim();
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }
  const campaignId = await activeCampaignId(guildId);
  const schedule =
    (campaignId ? await getCampaignSchedule(campaignId) : null) ??
    // Fall back to any schedule in the guild so one left behind by a
    // campaign switch stays visible.
    (await getGuildSchedule(guildId));
  return NextResponse.json({ schedule });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const guildId =
    body && typeof body.guildId === "string" ? body.guildId.trim() : "";
  const announcementChannelId =
    body && typeof body.announcementChannelId === "string"
      ? body.announcementChannelId.trim()
      : "";
  const createdByDiscordUserId =
    body && typeof body.createdByDiscordUserId === "string"
      ? body.createdByDiscordUserId.trim()
      : "";
  const weekday = body && typeof body.weekday === "number" ? body.weekday : NaN;
  const localTime =
    body && typeof body.localTime === "string" ? body.localTime.trim() : "";
  const timeZone =
    body && typeof body.timeZone === "string" ? body.timeZone.trim() : "";
  if (
    !guildId ||
    !announcementChannelId ||
    !createdByDiscordUserId ||
    !Number.isInteger(weekday) ||
    !localTime ||
    !timeZone
  ) {
    return NextResponse.json(
      { error: "Invalid schedule payload" },
      { status: 400 },
    );
  }
  const campaignId = await activeCampaignId(guildId);
  if (!campaignId) {
    return NextResponse.json({ error: "No active campaign" }, { status: 409 });
  }

  try {
    const schedule = await setCampaignSchedule({
      campaignId,
      guildId,
      announcementChannelId,
      weekday,
      localTime,
      timeZone,
      createdByDiscordUserId,
    });
    return NextResponse.json({ schedule });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid schedule" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const guildId =
    body && typeof body.guildId === "string" ? body.guildId.trim() : "";
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }
  // Remove by guild, not by active campaign: reminders from a schedule left
  // behind by a campaign switch must stay removable.
  const removed = await removeGuildSchedules(guildId);
  return NextResponse.json({ removed });
}
