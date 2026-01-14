import { db } from "@/db";
import { sessions } from "@/db/schema";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);

  if (!payload?.guildId || !payload?.channelId) {
    return NextResponse.json({ error: "Missing guildId or channelId" }, { status: 400 });
  }

  const [newSession] = await db
    .insert(sessions)
    .values({
      guildId: payload.guildId,
      channelId: payload.channelId,
      status: "active"
    })
    .returning({ id: sessions.id });

  return NextResponse.json({ sessionId: newSession?.id });
}
