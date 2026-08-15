import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { campaignSchedules, scheduledJobs } from "@/db/schema";
import { jobFailureDisposition } from "./policy";
import { startReminderDedupeKey } from "./schedules";
import { nextWeeklyOccurrence } from "./time";

export type ScheduledJob = typeof scheduledJobs.$inferSelect;

// Summary generation can legitimately take several minutes under provider
// load. A longer lease avoids paying for a duplicate model call while still
// allowing recovery after a crashed worker.
const DEFAULT_LEASE_DURATION_MS = 2 * 60_000;
const SUMMARY_LEASE_DURATION_MS = 15 * 60_000;

export async function claimDueJobs(input: {
  workerId: string;
  now?: Date;
  limit?: number;
}) {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 5, 20));
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(scheduledJobs)
      .where(
        and(
          lte(scheduledJobs.runAt, now),
          or(
            eq(scheduledJobs.status, "pending"),
            and(
              eq(scheduledJobs.status, "leased"),
              lte(scheduledJobs.leaseExpiresAt, now),
            ),
          ),
        ),
      )
      .orderBy(asc(scheduledJobs.runAt), asc(scheduledJobs.id))
      .limit(limit)
      .for("update", { skipLocked: true });

    const claimed: ScheduledJob[] = [];
    for (const candidate of candidates) {
      const leaseExpiresAt = new Date(
        now.getTime() +
          (candidate.type === "summarize_session"
            ? SUMMARY_LEASE_DURATION_MS
            : DEFAULT_LEASE_DURATION_MS),
      );
      const [updated] = await tx
        .update(scheduledJobs)
        .set({
          status: "leased",
          leaseOwner: input.workerId,
          leaseExpiresAt,
          attemptCount: sql`${scheduledJobs.attemptCount} + 1`,
        })
        .where(eq(scheduledJobs.id, candidate.id))
        .returning();
      if (updated) claimed.push(updated);
    }
    return claimed;
  });
}

export async function completeScheduledJob(input: {
  jobId: number;
  workerId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.id, input.jobId))
      .limit(1)
      .for("update");
    if (!job) return false;
    if (job.status === "completed") return true;
    if (job.status !== "leased" || job.leaseOwner !== input.workerId) {
      return false;
    }

    if (job.type === "game_start_reminder" && job.scheduleId) {
      const [schedule] = await tx
        .select()
        .from(campaignSchedules)
        .where(eq(campaignSchedules.id, job.scheduleId))
        .limit(1)
        .for("update");

      if (schedule?.enabled) {
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
    }

    await tx
      .update(scheduledJobs)
      .set({
        status: "completed",
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
      })
      .where(eq(scheduledJobs.id, job.id));
    return true;
  });
}

export async function failScheduledJob(input: {
  jobId: number;
  workerId: string;
  error: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.id, input.jobId))
      .limit(1)
      .for("update");
    if (!job || job.status !== "leased" || job.leaseOwner !== input.workerId) {
      return false;
    }

    const disposition = jobFailureDisposition({
      attemptCount: job.attemptCount,
      now,
      jobType: job.type,
    });
    await tx
      .update(scheduledJobs)
      .set({
        status: disposition.status,
        runAt: disposition.retryAt ?? job.runAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: input.error.slice(0, 2_000),
      })
      .where(eq(scheduledJobs.id, job.id));
    return true;
  });
}
