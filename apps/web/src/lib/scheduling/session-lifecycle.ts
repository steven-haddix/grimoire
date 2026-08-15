import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { scheduledJobs, sessions } from "@/db/schema";

export const SESSION_END_REASONS = [
  "manual_command",
  "stop_button",
  "max_duration",
  "expired_before_resume",
] as const;
export type SessionEndReason = (typeof SESSION_END_REASONS)[number];

export async function stopSessionRecord(input: {
  sessionId: number;
  reason: SessionEndReason;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .limit(1)
      .for("update");
    if (!session) return null;

    if (session.status !== "active") {
      return { session, stopped: false };
    }

    const [ended] = await tx
      .update(sessions)
      .set({
        status: "ended",
        endedAt: now,
        endedReason: input.reason,
      })
      .where(eq(sessions.id, session.id))
      .returning();

    await tx
      .update(scheduledJobs)
      .set({
        status: "cancelled",
        leaseOwner: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(scheduledJobs.sessionId, session.id),
          inArray(scheduledJobs.type, [
            "session_stop_reminder",
            "session_auto_stop",
          ]),
          eq(scheduledJobs.status, "pending"),
        ),
      );

    await tx
      .insert(scheduledJobs)
      .values({
        type: "summarize_session",
        sessionId: session.id,
        runAt: now,
        payload: { sessionId: session.id },
        dedupeKey: `session:${session.id}:summarize`,
      })
      .onConflictDoNothing({ target: scheduledJobs.dedupeKey });

    return { session: ended ?? session, stopped: true };
  });
}
