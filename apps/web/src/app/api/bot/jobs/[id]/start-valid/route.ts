import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { scheduledJobs } from "@/db/schema";
import { shouldDeliverStartReminder } from "@/lib/scheduling/time";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const jobId = Number(id);
  const guildId = new URL(req.url).searchParams.get("guildId")?.trim();
  if (!Number.isInteger(jobId) || jobId <= 0 || !guildId) {
    return NextResponse.json(
      { error: "Invalid job id or guild id" },
      { status: 400 },
    );
  }

  const job = await db.query.scheduledJobs.findFirst({
    where: eq(scheduledJobs.id, jobId),
    columns: { type: true, status: true, runAt: true, payload: true },
  });
  const payloadGuildId = job?.payload.guildId;
  // Validate against the immutable occurrence like the delivery side does:
  // retries rewrite runAt, which would drift the grace window. A delivered
  // reminder whose completion ack failed sits at "pending", so only statuses
  // that can never have been delivered are rejected.
  const payloadOccurrence =
    typeof job?.payload.occurrenceAt === "string"
      ? new Date(job.payload.occurrenceAt)
      : null;
  const occurrenceAt =
    payloadOccurrence && Number.isFinite(payloadOccurrence.getTime())
      ? payloadOccurrence
      : job?.runAt;
  const valid = Boolean(
    job &&
      occurrenceAt &&
      job.type === "game_start_reminder" &&
      job.status !== "cancelled" &&
      job.status !== "dead" &&
      payloadGuildId === guildId &&
      shouldDeliverStartReminder({ occurrenceAt, now: new Date() }),
  );
  return NextResponse.json({ valid });
}
