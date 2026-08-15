import { NextResponse } from "next/server";
import { claimDueJobs } from "@/lib/scheduling/jobs";

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const workerId =
    body && typeof body.workerId === "string" ? body.workerId.trim() : "";
  const limit = body && typeof body.limit === "number" ? body.limit : undefined;
  if (!workerId) {
    return NextResponse.json({ error: "Missing workerId" }, { status: 400 });
  }

  const jobs = await claimDueJobs({ workerId, limit });
  return NextResponse.json({ jobs });
}
