export const MAX_JOB_ATTEMPTS = 8;

export const JOB_TYPES = [
  "game_start_reminder",
  "session_stop_reminder",
  "session_auto_stop",
  "summarize_session",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type JobPolicy = {
  leaseDurationMs: number;
  // What happens once MAX_JOB_ATTEMPTS is exhausted: safety-critical jobs
  // keep retrying on a slow cadence, everything else dead-letters.
  onExhaustedAttempts: "retry-forever" | "dead";
};

const DEFAULT_LEASE_DURATION_MS = 2 * 60_000;
// Summary generation can legitimately take several minutes under provider
// load. A longer lease avoids paying for a duplicate model call while still
// allowing recovery after a crashed worker.
const SUMMARY_LEASE_DURATION_MS = 15 * 60_000;

const EXHAUSTED_RETRY_DELAY_MS = 15 * 60_000;

// The queue mechanics (claim/lease/fail) stay type-agnostic and read
// per-type behavior from this table; a new job type is a new entry here
// plus a handler, with no edits to the queue internals.
export const JOB_POLICIES: Record<JobType, JobPolicy> = {
  game_start_reminder: {
    leaseDurationMs: DEFAULT_LEASE_DURATION_MS,
    onExhaustedAttempts: "retry-forever",
  },
  session_stop_reminder: {
    leaseDurationMs: DEFAULT_LEASE_DURATION_MS,
    onExhaustedAttempts: "dead",
  },
  session_auto_stop: {
    leaseDurationMs: DEFAULT_LEASE_DURATION_MS,
    onExhaustedAttempts: "retry-forever",
  },
  summarize_session: {
    leaseDurationMs: SUMMARY_LEASE_DURATION_MS,
    onExhaustedAttempts: "dead",
  },
};

const FALLBACK_POLICY: JobPolicy = {
  leaseDurationMs: DEFAULT_LEASE_DURATION_MS,
  onExhaustedAttempts: "dead",
};

export function jobPolicy(type: string | undefined): JobPolicy {
  return JOB_POLICIES[type as JobType] ?? FALLBACK_POLICY;
}

export function jobRetryDelayMs(attemptCount: number) {
  const normalizedAttempt = Math.max(1, Math.floor(attemptCount));
  return Math.min(30_000 * 2 ** (normalizedAttempt - 1), 15 * 60_000);
}

export function jobFailureDisposition(input: {
  attemptCount: number;
  now: Date;
  jobType?: string;
}) {
  if (input.attemptCount >= MAX_JOB_ATTEMPTS) {
    if (jobPolicy(input.jobType).onExhaustedAttempts === "retry-forever") {
      return {
        status: "pending" as const,
        retryAt: new Date(input.now.getTime() + EXHAUSTED_RETRY_DELAY_MS),
      };
    }
    return { status: "dead" as const, retryAt: null };
  }
  return {
    status: "pending" as const,
    retryAt: new Date(
      input.now.getTime() + jobRetryDelayMs(input.attemptCount),
    ),
  };
}
