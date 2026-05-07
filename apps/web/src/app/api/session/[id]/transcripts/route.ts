import { and, asc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { sessions, transcripts } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, context: RouteContext) {
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const sessionId = parseInt(id, 10);
  if (Number.isNaN(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userGuilds = await getUserAdminGuilds();
  if (!userGuilds.some((g) => g.id === session.guildId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? Number.parseInt(sinceParam, 10) : 0;

  const lines = await db
    .select()
    .from(transcripts)
    .where(
      Number.isFinite(since) && since > 0
        ? and(
            eq(transcripts.sessionId, sessionId),
            gt(transcripts.id, since),
          )
        : eq(transcripts.sessionId, sessionId),
    )
    .orderBy(asc(transcripts.timestamp));

  return NextResponse.json({
    lines: lines.map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      speaker: l.speaker,
      content: l.content,
    })),
  });
}
