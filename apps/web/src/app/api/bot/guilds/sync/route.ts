import { NextResponse } from "next/server";
import { db } from "@/db";
import { botGuilds } from "@/db/schema";

type GuildSnapshot = {
  guildId: string;
  name: string;
  icon: string | null;
};

type SyncPayload = {
  guilds: GuildSnapshot[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseGuildSnapshot(value: unknown): GuildSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const guildId =
    typeof value.guildId === "string" ? value.guildId.trim() : "";
  if (!guildId) {
    return null;
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
  };
}

function parseSyncPayload(value: unknown): SyncPayload | null {
  if (!isRecord(value) || !Array.isArray(value.guilds)) {
    return null;
  }

  const guilds: GuildSnapshot[] = [];

  for (const entry of value.guilds) {
    const parsed = parseGuildSnapshot(entry);
    if (!parsed) {
      return null;
    }
    guilds.push(parsed);
  }

  return { guilds };
}

export async function POST(req: Request) {
  if (req.headers.get("x-bot-secret") !== process.env.BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = parseSyncPayload(await req.json().catch(() => null));

  if (!payload) {
    return NextResponse.json(
      { error: "Missing guild sync payload" },
      { status: 400 },
    );
  }

  const now = new Date();

  await db.update(botGuilds).set({
    installed: false,
    removedAt: now,
    updatedAt: now,
  });

  for (const guild of payload.guilds) {
    await db
      .insert(botGuilds)
      .values({
        guildId: guild.guildId,
        name: guild.name,
        icon: guild.icon,
        installed: true,
        installedAt: now,
        removedAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: botGuilds.guildId,
        set: {
          name: guild.name,
          icon: guild.icon,
          installed: true,
          removedAt: null,
          updatedAt: now,
        },
      });
  }

  return NextResponse.json({ ok: true, count: payload.guilds.length });
}
