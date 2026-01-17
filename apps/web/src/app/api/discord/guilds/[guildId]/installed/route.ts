import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth/server";
import { db } from "@/db";
import { botGuilds } from "@/db/schema";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: { guildId?: string } | Promise<{ guildId?: string }>;
};

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolvedParams = await params;
  const guildId = resolvedParams.guildId?.trim();
  if (!guildId) {
    return NextResponse.json({ error: "Missing guildId" }, { status: 400 });
  }

  const [record] = await db
    .select({ installed: botGuilds.installed })
    .from(botGuilds)
    .where(eq(botGuilds.guildId, guildId))
    .limit(1);

  return NextResponse.json({ installed: record?.installed === true });
}
