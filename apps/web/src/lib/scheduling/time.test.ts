import { describe, expect, test } from "bun:test";
import {
  discordTimestamp,
  nextWeeklyOccurrence,
  normalizeTimeZone,
  sessionDeadlines,
  shouldDeliverStartReminder,
  weekdayNumber,
} from "./time";

describe("normalizeTimeZone", () => {
  test.each([
    ["EST", "America/New_York"],
    ["edt", "America/New_York"],
    ["ET", "America/New_York"],
    ["CST", "America/Chicago"],
    ["MT", "America/Denver"],
    ["PDT", "America/Los_Angeles"],
    ["UTC", "UTC"],
  ])("maps %s to a DST-aware IANA zone", (input, expected) => {
    expect(normalizeTimeZone(input)).toBe(expected);
  });

  test("accepts and canonicalizes an IANA timezone", () => {
    expect(normalizeTimeZone("America/New_York")).toBe("America/New_York");
  });

  test("rejects empty and unknown timezones", () => {
    expect(() => normalizeTimeZone("  ")).toThrow("Timezone is required");
    expect(() => normalizeTimeZone("Middle/Earth")).toThrow("Unknown timezone");
  });
});

describe("nextWeeklyOccurrence", () => {
  test("returns later today when the local game time has not passed", () => {
    expect(
      nextWeeklyOccurrence({
        weekday: weekdayNumber("wednesday"),
        localTime: "20:30",
        timeZone: "America/New_York",
        after: new Date("2026-08-12T20:00:00Z"), // Wed 4:00 PM EDT
      }).toISOString(),
    ).toBe("2026-08-13T00:30:00.000Z");
  });

  test("moves to next week when called at the exact scheduled instant", () => {
    expect(
      nextWeeklyOccurrence({
        weekday: 3,
        localTime: "20:30",
        timeZone: "EST",
        after: new Date("2026-08-13T00:30:00.000Z"),
      }).toISOString(),
    ).toBe("2026-08-20T00:30:00.000Z");
  });

  test("uses the campaign timezone's date rather than the UTC date", () => {
    // It is already Monday in UTC but still Sunday evening in Los Angeles.
    expect(
      nextWeeklyOccurrence({
        weekday: 0,
        localTime: "23:30",
        timeZone: "America/Los_Angeles",
        after: new Date("2026-06-08T05:00:00.000Z"),
      }).toISOString(),
    ).toBe("2026-06-08T06:30:00.000Z");
  });

  test("preserves 8:30 PM across the spring DST transition", () => {
    expect(
      nextWeeklyOccurrence({
        weekday: 3,
        localTime: "20:30",
        timeZone: "America/New_York",
        after: new Date("2026-03-05T02:00:00.000Z"),
      }).toISOString(),
    ).toBe("2026-03-12T00:30:00.000Z");
  });

  test("preserves 8:30 PM across the fall DST transition", () => {
    expect(
      nextWeeklyOccurrence({
        weekday: 3,
        localTime: "20:30",
        timeZone: "America/New_York",
        after: new Date("2026-10-29T01:00:00.000Z"),
      }).toISOString(),
    ).toBe("2026-11-05T01:30:00.000Z");
  });

  test("skips a nonexistent spring-forward wall-clock time", () => {
    expect(
      nextWeeklyOccurrence({
        weekday: 0,
        localTime: "02:30",
        timeZone: "America/New_York",
        after: new Date("2026-03-07T12:00:00.000Z"),
      }).toISOString(),
    ).toBe("2026-03-15T06:30:00.000Z");
  });

  test("chooses the first occurrence of an ambiguous fall-back time", () => {
    expect(
      nextWeeklyOccurrence({
        weekday: 0,
        localTime: "01:30",
        timeZone: "America/New_York",
        after: new Date("2026-10-31T12:00:00.000Z"),
      }).toISOString(),
    ).toBe("2026-11-01T05:30:00.000Z");
  });

  test("crosses month and year boundaries", () => {
    expect(
      nextWeeklyOccurrence({
        weekday: 4,
        localTime: "20:30",
        timeZone: "UTC",
        after: new Date("2026-12-31T21:00:00.000Z"),
      }).toISOString(),
    ).toBe("2027-01-07T20:30:00.000Z");
  });

  test("supports zones with non-hour UTC offsets", () => {
    expect(
      nextWeeklyOccurrence({
        weekday: 3,
        localTime: "20:30",
        timeZone: "Asia/Kathmandu",
        after: new Date("2026-08-11T00:00:00.000Z"),
      }).toISOString(),
    ).toBe("2026-08-12T14:45:00.000Z");
  });

  test("does not fire twice during a fall-back overlap", () => {
    // The first 1:30 occurred at 05:30Z. Even though the clock repeats 1:30
    // at 06:30Z, a weekly schedule fires only once and advances a week.
    expect(
      nextWeeklyOccurrence({
        weekday: 0,
        localTime: "01:30",
        timeZone: "America/New_York",
        after: new Date("2026-11-01T05:45:00.000Z"),
      }).toISOString(),
    ).toBe("2026-11-08T06:30:00.000Z");
  });

  test("rejects invalid weekday and clock values", () => {
    expect(() =>
      nextWeeklyOccurrence({
        weekday: 7,
        localTime: "20:30",
        timeZone: "UTC",
        after: new Date(),
      }),
    ).toThrow("Weekday");
    expect(() =>
      nextWeeklyOccurrence({
        weekday: 3,
        localTime: "8:30pm",
        timeZone: "UTC",
        after: new Date(),
      }),
    ).toThrow("HH:mm");
    expect(() =>
      nextWeeklyOccurrence({
        weekday: 3,
        localTime: "24:00",
        timeZone: "UTC",
        after: new Date(),
      }),
    ).toThrow("valid 24-hour");
  });
});

describe("session timing policy", () => {
  test("sets reminders at exactly three hours and the cap at four hours", () => {
    const start = new Date("2026-08-12T20:30:12.345Z");
    const deadlines = sessionDeadlines(start);
    expect(deadlines.stopReminderAt.toISOString()).toBe(
      "2026-08-12T23:30:12.345Z",
    );
    expect(deadlines.autoStopAt.toISOString()).toBe("2026-08-13T00:30:12.345Z");
  });

  test("delivers a due start reminder through the inclusive grace boundary", () => {
    const occurrenceAt = new Date("2026-08-13T00:30:00.000Z");
    expect(
      shouldDeliverStartReminder({
        occurrenceAt,
        now: new Date("2026-08-13T00:29:59.999Z"),
      }),
    ).toBe(false);
    expect(
      shouldDeliverStartReminder({ occurrenceAt, now: occurrenceAt }),
    ).toBe(true);
    expect(
      shouldDeliverStartReminder({
        occurrenceAt,
        now: new Date("2026-08-13T01:30:00.000Z"),
      }),
    ).toBe(true);
    expect(
      shouldDeliverStartReminder({
        occurrenceAt,
        now: new Date("2026-08-13T01:30:00.001Z"),
      }),
    ).toBe(false);
  });

  test("renders Discord timestamps at whole-second precision", () => {
    expect(discordTimestamp(new Date("2026-08-13T00:30:00.999Z"), "R")).toBe(
      "<t:1786581000:R>",
    );
  });
});
