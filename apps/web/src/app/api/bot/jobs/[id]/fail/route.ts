import { NextResponse } from "next/server";
import { failScheduledJob } from "@/lib/scheduling/jobs";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const jobId = Number(id);
  const body = await req.json().catch(() => null);
  const workerId =
    body && typeof body.workerId === "string" ? body.workerId.trim() : "";
  const error =
    body && typeof body.error === "string" ? body.error : "Unknown error";
  if (!Number.isInteger(jobId) || jobId <= 0 || !workerId) {
    return NextResponse.json(
      { error: "Invalid jobId or workerId" },
      { status: 400 },
    );
  }

  const failed = await failScheduledJob({ jobId, workerId, error });
  if (!failed) {
    return NextResponse.json(
      { error: "Job lease is no longer owned by this worker" },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
