import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import {
  SESSION_END_REASONS,
  type SessionEndReason,
  stopSessionRecord,
} from "@/lib/scheduling/session-lifecycle";

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const reason = body && typeof body.reason === "string" ? body.reason : "";
  if (!SESSION_END_REASONS.includes(reason as SessionEndReason)) {
    return NextResponse.json(
      { error: "Invalid sessionId or stop reason" },
      { status: 400 },
    );
  }

  let sessionId = body ? Number(body.sessionId) : NaN;
  const guildId =
    body && typeof body.guildId === "string" ? body.guildId.trim() : "";
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    // The bot loses its in-memory session map on restart; let it stop the
    // guild's active session without knowing the id.
    if (!guildId) {
      return NextResponse.json(
        { error: "Invalid sessionId or stop reason" },
        { status: 400 },
      );
    }
    const active = await db.query.sessions.findFirst({
      where: and(
        eq(sessions.guildId, guildId),
        eq(sessions.status, "active"),
        isNull(sessions.endedAt),
      ),
      orderBy: desc(sessions.startedAt),
      columns: { id: true },
    });
    if (!active) {
      return NextResponse.json({
        success: true,
        stopped: false,
        status: "no_active_session",
      });
    }
    sessionId = active.id;
  }

  const result = await stopSessionRecord({
    sessionId,
    reason: reason as SessionEndReason,
  });
  if (!result) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    stopped: result.stopped,
    status: result.session.status,
  });
}
