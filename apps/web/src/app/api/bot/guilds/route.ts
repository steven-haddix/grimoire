import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { botGuilds } from "@/db/schema";

type InstalledPayload = {
  guildId: string;
  name: string;
  icon: string | null;
  installed: true;
};

type RemovedPayload = {
  guildId: string;
  installed: false;
};

type PresencePayload = InstalledPayload | RemovedPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePresencePayload(value: unknown): PresencePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const guildId =
    typeof value.guildId === "string" ? value.guildId.trim() : "";

  if (!guildId) {
    return null;
  }

  const installed =
    typeof value.installed === "boolean" ? value.installed : true;

  if (!installed) {
    return { guildId, installed: false };
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) {
    return null;
  }

  let icon: string | null = null;
  if (typeof value.icon === "string") {
    icon = value.icon;
  } else if (value.icon === null || typeof value.icon === "undefined") {
    icon = null;
  } else {
    return null;
  }

  return {
    guildId,
    name,
    icon,
    installed: true,
  };
}

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = parsePresencePayload(await req.json().catch(() => null));

  if (!payload) {
    return NextResponse.json(
      { error: "Missing guild payload" },
      { status: 400 },
    );
  }

  const now = new Date();

  if (payload.installed) {
    await db
      .insert(botGuilds)
      .values({
        guildId: payload.guildId,
        name: payload.name,
        icon: payload.icon,
        installed: true,
        installedAt: now,
        removedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: botGuilds.guildId,
        set: {
          name: payload.name,
          icon: payload.icon,
          installed: true,
          removedAt: null,
          updatedAt: now,
        },
      });
  } else {
    await db
      .update(botGuilds)
      .set({
        installed: false,
        removedAt: now,
        updatedAt: now,
      })
      .where(eq(botGuilds.guildId, payload.guildId));
  }

  return NextResponse.json({ ok: true });
}
