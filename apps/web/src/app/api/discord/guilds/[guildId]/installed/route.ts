import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { db } from "@/db";
import { guildInstallations } from "@/db/schema";

export const dynamic = "force-dynamic";

type InstalledResponse = {
  installed: boolean;
};

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

  const botBase = process.env.BOT_API_URL?.replace(/\/$/, "");
  if (!botBase) {
    return NextResponse.json({ error: "Missing BOT_API_URL" }, { status: 500 });
  }

  const botSecret = process.env.BOT_SECRET;
  if (!botSecret) {
    return NextResponse.json({ error: "Missing BOT_SECRET" }, { status: 500 });
  }

  const res = await fetch(`${botBase}/guilds/${guildId}/installed`, {
    headers: {
      "x-bot-secret": botSecret,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const details = await res.text().catch(() => "");
    return NextResponse.json(
      { error: "Bot check failed", details },
      { status: 502 },
    );
  }

  const data = (await res.json()) as InstalledResponse;
  const installed = data.installed === true;

  await db
    .insert(guildInstallations)
    .values({
      guildId,
      installed,
      checkedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: guildInstallations.guildId,
      set: {
        installed,
        checkedAt: new Date(),
      },
    });

  return NextResponse.json({ installed });
}
