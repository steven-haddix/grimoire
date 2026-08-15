export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

const TIME_ZONE_ALIASES: Record<string, string> = {
  ET: "America/New_York",
  EST: "America/New_York",
  EDT: "America/New_York",
  CT: "America/Chicago",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MT: "America/Denver",
  MST: "America/Denver",
  MDT: "America/Denver",
  PT: "America/Los_Angeles",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  UTC: "UTC",
  GMT: "UTC",
};

type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function localParts(instant: Date, timeZone: string): LocalDateTime {
  const values = new Map(
    getFormatter(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
  };
}

function sameLocalDateTime(a: LocalDateTime, b: LocalDateTime) {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute
  );
}

function parseLocalTime(localTime: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(localTime);
  if (!match) throw new Error("Time must use HH:mm format");

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Time must be a valid 24-hour clock time");
  }
  return { hour, minute };
}

/**
 * Resolve a wall-clock time in an IANA zone. A spring-forward gap returns
 * null. During a fall-back overlap, the earlier occurrence wins so a weekly
 * schedule fires once, not twice.
 */
function resolveLocalDateTime(
  target: LocalDateTime,
  timeZone: string,
): Date | null {
  const wallClockAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );

  // Every IANA offset is within this window. Scanning by minute is deliberate:
  // offsets are not universally whole hours and DST overlaps can have two
  // valid instants for the same wall-clock time.
  const searchStart = wallClockAsUtc - 14 * 60 * 60 * 1000;
  const searchEnd = wallClockAsUtc + 14 * 60 * 60 * 1000;
  for (
    let timestamp = searchStart;
    timestamp <= searchEnd;
    timestamp += 60_000
  ) {
    const candidate = new Date(timestamp);
    if (sameLocalDateTime(localParts(candidate, timeZone), target)) {
      return candidate;
    }
  }
  return null;
}

export function normalizeTimeZone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Timezone is required");

  const alias = TIME_ZONE_ALIASES[trimmed.toUpperCase()];
  const candidate = alias ?? trimmed;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: candidate,
    }).resolvedOptions().timeZone;
  } catch {
    throw new Error(`Unknown timezone: ${value}`);
  }
}

export function weekdayNumber(day: Weekday): number {
  return WEEKDAYS.indexOf(day);
}

export function nextWeeklyOccurrence(input: {
  weekday: number;
  localTime: string;
  timeZone: string;
  after: Date;
}): Date {
  if (
    !Number.isInteger(input.weekday) ||
    input.weekday < 0 ||
    input.weekday > 6
  ) {
    throw new Error(
      "Weekday must be an integer from 0 (Sunday) to 6 (Saturday)",
    );
  }
  const { hour, minute } = parseLocalTime(input.localTime);
  const timeZone = normalizeTimeZone(input.timeZone);
  const afterLocal = localParts(input.after, timeZone);
  const localDateCursor = new Date(
    Date.UTC(afterLocal.year, afterLocal.month - 1, afterLocal.day),
  );

  // Fourteen days covers a DST gap that invalidates this week's wall-clock
  // time and therefore needs to skip to the following week.
  for (let offset = 0; offset <= 14; offset += 1) {
    const date = new Date(localDateCursor.getTime() + offset * 86_400_000);
    if (date.getUTCDay() !== input.weekday) continue;

    const candidate = resolveLocalDateTime(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour,
        minute,
      },
      timeZone,
    );
    if (candidate && candidate.getTime() > input.after.getTime()) {
      return candidate;
    }
  }

  throw new Error("Could not resolve the next weekly occurrence");
}

export function sessionDeadlines(startedAt: Date) {
  return {
    stopReminderAt: new Date(startedAt.getTime() + 3 * 60 * 60 * 1000),
    autoStopAt: new Date(startedAt.getTime() + 4 * 60 * 60 * 1000),
  };
}

export function shouldDeliverStartReminder(input: {
  occurrenceAt: Date;
  now: Date;
  graceMinutes?: number;
}) {
  const graceMs = (input.graceMinutes ?? 60) * 60_000;
  const lateness = input.now.getTime() - input.occurrenceAt.getTime();
  return lateness >= 0 && lateness <= graceMs;
}

export function discordTimestamp(date: Date, style: "F" | "R" = "F") {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
