import type { db } from "@/db";
import type { scheduledJobs } from "@/db/schema";
import type { JobType } from "./policy";
import { scheduleNextWeeklyReminder } from "./schedules";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ScheduledJobRow = typeof scheduledJobs.$inferSelect;

export type JobCompletionHook = (
  tx: Tx,
  job: ScheduledJobRow,
  now: Date,
) => Promise<void>;

// Business logic that must run atomically with a job's completion, keyed by
// type so the queue's ack path stays type-agnostic.
const JOB_COMPLETION_HOOKS: Partial<Record<JobType, JobCompletionHook>> = {
  game_start_reminder: scheduleNextWeeklyReminder,
};

export function jobCompletionHook(type: string): JobCompletionHook | undefined {
  return JOB_COMPLETION_HOOKS[type as JobType];
}
