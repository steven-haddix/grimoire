import { describe, expect, test } from "bun:test";
import {
  JOB_POLICIES,
  jobFailureDisposition,
  jobPolicy,
  jobRetryDelayMs,
  MAX_JOB_ATTEMPTS,
} from "./policy";

describe("scheduled job retry policy", () => {
  test.each([
    [0, 30_000],
    [1, 30_000],
    [2, 60_000],
    [3, 120_000],
    [6, 900_000],
    [20, 900_000],
  ])("uses capped exponential backoff for attempt %i", (attempt, expected) => {
    expect(jobRetryDelayMs(attempt)).toBe(expected);
  });

  test("requeues failures below the attempt cap", () => {
    const now = new Date("2026-08-12T20:00:00.000Z");
    expect(jobFailureDisposition({ attemptCount: 2, now })).toEqual({
      status: "pending",
      retryAt: new Date("2026-08-12T20:01:00.000Z"),
    });
  });

  test("marks a job dead at the attempt cap", () => {
    expect(
      jobFailureDisposition({
        attemptCount: MAX_JOB_ATTEMPTS,
        now: new Date("2026-08-12T20:00:00.000Z"),
      }),
    ).toEqual({ status: "dead", retryAt: null });
  });

  test.each([
    "game_start_reminder",
    "session_auto_stop",
  ])("keeps critical %s work retryable after the normal cap", (jobType) => {
    expect(
      jobFailureDisposition({
        attemptCount: MAX_JOB_ATTEMPTS,
        jobType,
        now: new Date("2026-08-12T20:00:00.000Z"),
      }),
    ).toEqual({
      status: "pending",
      retryAt: new Date("2026-08-12T20:15:00.000Z"),
    });
  });

  test("summarize jobs lease longer than delivery jobs", () => {
    expect(JOB_POLICIES.summarize_session.leaseDurationMs).toBeGreaterThan(
      JOB_POLICIES.game_start_reminder.leaseDurationMs,
    );
  });

  test("unknown job types fall back to a default dead-letter policy", () => {
    expect(jobPolicy("mystery_job")).toEqual({
      leaseDurationMs: JOB_POLICIES.session_stop_reminder.leaseDurationMs,
      onExhaustedAttempts: "dead",
    });
  });
});
