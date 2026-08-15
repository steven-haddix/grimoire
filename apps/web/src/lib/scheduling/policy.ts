export const MAX_JOB_ATTEMPTS = 8;

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
    if (
      input.jobType === "game_start_reminder" ||
      input.jobType === "session_auto_stop"
    ) {
      return {
        status: "pending" as const,
        retryAt: new Date(input.now.getTime() + 15 * 60_000),
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
