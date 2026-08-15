import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { campaignSchedules, campaigns, scheduledJobs } from "@/db/schema";
import { nextWeeklyOccurrence, normalizeTimeZone } from "./time";

export type SetCampaignScheduleInput = {
  campaignId: number;
  guildId: string;
  announcementChannelId: string;
  weekday: number;
  localTime: string;
  timeZone: string;
  createdByDiscordUserId: string;
  now?: Date;
};

function startReminderPayload(input: {
  guildId: string;
  channelId: string;
  campaignId: number;
  campaignName: string;
  occurrenceAt: Date;
}) {
  return {
    guildId: input.guildId,
    channelId: input.channelId,
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    occurrenceAt: input.occurrenceAt.toISOString(),
  };
}

export function startReminderDedupeKey(scheduleId: number, occurrenceAt: Date) {
  return `schedule:${scheduleId}:start:${occurrenceAt.toISOString()}`;
}

export async function setCampaignSchedule(input: SetCampaignScheduleInput) {
  const now = input.now ?? new Date();
  const timeZone = normalizeTimeZone(input.timeZone);
  const nextOccurrenceAt = nextWeeklyOccurrence({
    weekday: input.weekday,
    localTime: input.localTime,
    timeZone,
    after: now,
  });

  const campaign = await db.query.campaigns.findFirst({
    where: and(
      eq(campaigns.id, input.campaignId),
      eq(campaigns.guildId, input.guildId),
    ),
    columns: { id: true, name: true },
  });
  if (!campaign) throw new Error("Campaign not found in this Discord server");

  return db.transaction(async (tx) => {
    const [schedule] = await tx
      .insert(campaignSchedules)
      .values({
        campaignId: campaign.id,
        guildId: input.guildId,
        announcementChannelId: input.announcementChannelId,
        weekday: input.weekday,
        localTime: input.localTime,
        timeZone,
        enabled: true,
        nextOccurrenceAt,
        createdByDiscordUserId: input.createdByDiscordUserId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: campaignSchedules.campaignId,
        set: {
          guildId: input.guildId,
          announcementChannelId: input.announcementChannelId,
          weekday: input.weekday,
          localTime: input.localTime,
          timeZone,
          enabled: true,
          nextOccurrenceAt,
          createdByDiscordUserId: input.createdByDiscordUserId,
          updatedAt: now,
        },
      })
      .returning();

    if (!schedule) throw new Error("Failed to save campaign schedule");

    await tx
      .update(scheduledJobs)
      .set({ status: "cancelled", leaseOwner: null, leaseExpiresAt: null })
      .where(
        and(
          eq(scheduledJobs.scheduleId, schedule.id),
          inArray(scheduledJobs.status, ["pending", "leased"]),
        ),
      );

    const payload = startReminderPayload({
      guildId: input.guildId,
      channelId: input.announcementChannelId,
      campaignId: campaign.id,
      campaignName: campaign.name,
      occurrenceAt: nextOccurrenceAt,
    });
    await tx
      .insert(scheduledJobs)
      .values({
        type: "game_start_reminder",
        scheduleId: schedule.id,
        runAt: nextOccurrenceAt,
        payload,
        dedupeKey: startReminderDedupeKey(schedule.id, nextOccurrenceAt),
      })
      .onConflictDoUpdate({
        target: scheduledJobs.dedupeKey,
        set: {
          status: "pending",
          runAt: nextOccurrenceAt,
          payload,
          leaseOwner: null,
          leaseExpiresAt: null,
          attemptCount: 0,
          lastError: null,
          completedAt: null,
        },
      });

    return schedule;
  });
}

export async function getCampaignSchedule(campaignId: number) {
  return (
    (await db.query.campaignSchedules.findFirst({
      where: eq(campaignSchedules.campaignId, campaignId),
    })) ?? null
  );
}

// Guild-wide variants: a schedule belongs to a campaign, but switching the
// active campaign must not strand another campaign's schedule where no
// command can see or remove it — its weekly reminders keep firing.
export async function getGuildSchedule(guildId: string) {
  return (
    (await db.query.campaignSchedules.findFirst({
      where: eq(campaignSchedules.guildId, guildId),
    })) ?? null
  );
}

export async function removeGuildSchedules(guildId: string) {
  const removed = await db
    .delete(campaignSchedules)
    .where(eq(campaignSchedules.guildId, guildId))
    .returning();
  return removed.length > 0;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ScheduledJobRow = typeof scheduledJobs.$inferSelect;

// Completion hook for game_start_reminder jobs. Runs inside the job's
// completion transaction so an enabled schedule always has exactly one
// upcoming occurrence enqueued.
export async function scheduleNextWeeklyReminder(
  tx: Tx,
  job: ScheduledJobRow,
  now: Date,
) {
  if (!job.scheduleId) return;

  const [schedule] = await tx
    .select()
    .from(campaignSchedules)
    .where(eq(campaignSchedules.id, job.scheduleId))
    .limit(1)
    .for("update");
  if (!schedule?.enabled) return;

  const occurrenceRaw = job.payload.occurrenceAt;
  const occurrenceAt =
    typeof occurrenceRaw === "string" &&
    Number.isFinite(new Date(occurrenceRaw).getTime())
      ? new Date(occurrenceRaw)
      : job.runAt;
  const after = new Date(Math.max(now.getTime(), occurrenceAt.getTime()));
  const nextOccurrenceAt = nextWeeklyOccurrence({
    weekday: schedule.weekday,
    localTime: schedule.localTime,
    timeZone: schedule.timeZone,
    after,
  });
  const nextPayload = {
    ...job.payload,
    channelId: schedule.announcementChannelId,
    occurrenceAt: nextOccurrenceAt.toISOString(),
  };

  await tx
    .update(campaignSchedules)
    .set({ nextOccurrenceAt, updatedAt: now })
    .where(eq(campaignSchedules.id, schedule.id));
  await tx
    .insert(scheduledJobs)
    .values({
      type: "game_start_reminder",
      scheduleId: schedule.id,
      runAt: nextOccurrenceAt,
      payload: nextPayload,
      dedupeKey: startReminderDedupeKey(schedule.id, nextOccurrenceAt),
    })
    .onConflictDoNothing({ target: scheduledJobs.dedupeKey });
}

export async function removeCampaignSchedule(input: {
  campaignId: number;
  guildId: string;
}) {
  const schedule = await db.query.campaignSchedules.findFirst({
    where: and(
      eq(campaignSchedules.campaignId, input.campaignId),
      eq(campaignSchedules.guildId, input.guildId),
    ),
    columns: { id: true },
  });
  if (!schedule) return false;

  await db
    .delete(campaignSchedules)
    .where(eq(campaignSchedules.id, schedule.id));
  return true;
}
