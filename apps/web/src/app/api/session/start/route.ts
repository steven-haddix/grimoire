import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { botGuilds, scheduledJobs, sessions } from "@/db/schema";
import { stopSessionRecord } from "@/lib/scheduling/session-lifecycle";
import { sessionDeadlines } from "@/lib/scheduling/time";

type SessionStartPayload = {
  guildId: string;
  channelId: string;
  textChannelId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUniqueViolation(error: unknown): boolean {
  for (
    let cause: unknown = error;
    typeof cause === "object" && cause !== null;
    cause = (cause as { cause?: unknown }).cause
  ) {
    if ((cause as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

function parseSessionStartPayload(value: unknown): SessionStartPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.guildId !== "string" || value.guildId.trim() === "") {
    return null;
  }

  if (typeof value.channelId !== "string" || value.channelId.trim() === "") {
    return null;
  }

  if (
    typeof value.textChannelId !== "string" ||
    value.textChannelId.trim() === ""
  ) {
    return null;
  }

  return {
    guildId: value.guildId,
    channelId: value.channelId,
    textChannelId: value.textChannelId,
  };
}

function sessionJobPayload(input: SessionStartPayload & { sessionId: number }) {
  return {
    guildId: input.guildId,
    channelId: input.textChannelId,
    sessionId: input.sessionId,
  };
}

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = parseSessionStartPayload(await req.json().catch(() => null));

  if (!payload) {
    return NextResponse.json(
      { error: "Missing guildId, voice channelId, or textChannelId" },
      { status: 400 },
    );
  }

  let existing = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.guildId, payload.guildId),
      eq(sessions.channelId, payload.channelId),
      eq(sessions.status, "active"),
      isNull(sessions.endedAt),
    ),
    orderBy: desc(sessions.startedAt),
    columns: {
      id: true,
      startedAt: true,
      stopReminderAt: true,
      autoStopAt: true,
    },
  });

  if (existing) {
    const existingId = existing.id;
    const deadlines = sessionDeadlines(existing.startedAt);
    const stopReminderAt =
      existing.stopReminderAt &&
      existing.stopReminderAt.getTime() < deadlines.stopReminderAt.getTime()
        ? existing.stopReminderAt
        : deadlines.stopReminderAt;
    const autoStopAt =
      existing.autoStopAt &&
      existing.autoStopAt.getTime() < deadlines.autoStopAt.getTime()
        ? existing.autoStopAt
        : deadlines.autoStopAt;

    if (autoStopAt.getTime() <= Date.now()) {
      await stopSessionRecord({
        sessionId: existingId,
        reason: "expired_before_resume",
      });
      existing = undefined;
    } else {
      await db.transaction(async (tx) => {
        await tx
          .update(sessions)
          .set({
            textChannelId: payload.textChannelId,
            stopReminderAt,
            autoStopAt,
          })
          .where(eq(sessions.id, existingId));
        const jobPayload = sessionJobPayload({
          ...payload,
          sessionId: existingId,
        });
        await tx
          .insert(scheduledJobs)
          .values([
            {
              type: "session_stop_reminder",
              sessionId: existingId,
              runAt: stopReminderAt,
              payload: jobPayload,
              dedupeKey: `session:${existingId}:stop-reminder`,
            },
            {
              type: "session_auto_stop",
              sessionId: existingId,
              runAt: autoStopAt,
              payload: jobPayload,
              dedupeKey: `session:${existingId}:auto-stop`,
            },
          ])
          .onConflictDoNothing({ target: scheduledJobs.dedupeKey });
        // Existing pending jobs keep their original payload through the
        // conflict above; refresh it so reminders follow the channel the
        // session was resumed from.
        await tx
          .update(scheduledJobs)
          .set({ payload: jobPayload })
          .where(
            and(
              inArray(scheduledJobs.dedupeKey, [
                `session:${existingId}:stop-reminder`,
                `session:${existingId}:auto-stop`,
              ]),
              eq(scheduledJobs.status, "pending"),
            ),
          );
      });
      return NextResponse.json({
        sessionId: existingId,
        resumed: true,
        stopReminderAt,
        autoStopAt,
      });
    }
  }

  const guildData = await db.query.botGuilds.findFirst({
    where: eq(botGuilds.guildId, payload.guildId),
    columns: { activeCampaignId: true },
  });

  const startedAt = new Date();
  const { stopReminderAt, autoStopAt } = sessionDeadlines(startedAt);
  const createSession = () =>
    db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(sessions)
        .values({
          guildId: payload.guildId,
          channelId: payload.channelId,
          textChannelId: payload.textChannelId,
          campaignId: guildData?.activeCampaignId,
          status: "active",
          startedAt,
          stopReminderAt,
          autoStopAt,
        })
        .returning();
      if (!inserted) throw new Error("Failed to create session");

      const jobPayload = sessionJobPayload({
        ...payload,
        sessionId: inserted.id,
      });
      await tx.insert(scheduledJobs).values([
        {
          type: "session_stop_reminder",
          sessionId: inserted.id,
          runAt: stopReminderAt,
          payload: jobPayload,
          dedupeKey: `session:${inserted.id}:stop-reminder`,
        },
        {
          type: "session_auto_stop",
          sessionId: inserted.id,
          runAt: autoStopAt,
          payload: jobPayload,
          dedupeKey: `session:${inserted.id}:auto-stop`,
        },
      ]);
      return inserted;
    });

  let newSession: Awaited<ReturnType<typeof createSession>>;
  try {
    newSession = await createSession();
  } catch (error) {
    // Concurrent starts (e.g. two clicks on a broadcast Start button) both
    // pass the active-session lookup; the partial unique index sends the
    // loser here — hand back the winner's session as a resume.
    if (isUniqueViolation(error)) {
      const winner = await db.query.sessions.findFirst({
        where: and(
          eq(sessions.guildId, payload.guildId),
          eq(sessions.channelId, payload.channelId),
          eq(sessions.status, "active"),
          isNull(sessions.endedAt),
        ),
        orderBy: desc(sessions.startedAt),
        columns: {
          id: true,
          startedAt: true,
          stopReminderAt: true,
          autoStopAt: true,
        },
      });
      if (winner) {
        const deadlines = sessionDeadlines(winner.startedAt);
        return NextResponse.json({
          sessionId: winner.id,
          resumed: true,
          stopReminderAt: winner.stopReminderAt ?? deadlines.stopReminderAt,
          autoStopAt: winner.autoStopAt ?? deadlines.autoStopAt,
        });
      }
    }
    throw error;
  }

  return NextResponse.json({
    sessionId: newSession.id,
    resumed: false,
    stopReminderAt,
    autoStopAt,
  });
}
