import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { scheduledJobs } from "@/db/schema";
import { jobCompletionHook } from "./completion-hooks";
import { jobFailureDisposition, jobPolicy } from "./policy";

export type ScheduledJob = typeof scheduledJobs.$inferSelect;

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
        now.getTime() + jobPolicy(candidate.type).leaseDurationMs,
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

    const hook = jobCompletionHook(job.type);
    if (hook) await hook(tx, job, now);

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
