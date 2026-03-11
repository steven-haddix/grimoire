"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { campaigns, sessionNotes, sessions } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import {
  buildPortalSessionInsert,
  extractNotes,
  type NoteDraft,
  parseOccurredAt,
  parseOptionalInteger,
  parsePortalSessionStatus,
  parseRequiredInteger,
  parseRequiredString,
} from "@/lib/sessions/portal-session";
import { generateSessionSummary } from "@/lib/sessions/summarize-session";

type AuthenticatedUser = {
  id: string;
  name: string;
};

async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return {
    id: session.user.id,
    name: session.user.name || session.user.email || "Unknown user",
  };
}

async function requireGuildAccess(guildId: string) {
  const adminGuilds = await getUserAdminGuilds();
  const hasAccess = adminGuilds.some((guild) => guild.id === guildId);

  if (!hasAccess) {
    throw new Error("Unauthorized access to guild");
  }
}

async function insertNotes(
  sessionId: number,
  user: AuthenticatedUser,
  notes: NoteDraft[],
) {
  await db.insert(sessionNotes).values(
    notes.map((note) => ({
      sessionId,
      content: note.content,
      source: note.source,
      createdByUserId: user.id,
      createdByName: user.name,
    })),
  );
}

export async function addSessionNotes(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const sessionId = parseRequiredInteger(
    formData.get("sessionId"),
    "sessionId",
  );
  const notes = await extractNotes({
    noteText: formData.get("notes"),
    files: formData.getAll("noteFiles"),
    requireAtLeastOne: true,
  });

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    columns: {
      id: true,
      guildId: true,
      campaignId: true,
      status: true,
    },
  });

  if (!session) {
    throw new Error("Session not found");
  }

  await requireGuildAccess(session.guildId);
  await insertNotes(sessionId, user, notes);

  let summary = null;
  if (session.status !== "active") {
    summary = await generateSessionSummary(sessionId);
  }

  revalidatePath("/account/sessions");
  if (session.campaignId) {
    revalidatePath(`/account/campaigns/${session.campaignId}`);
  }

  return {
    success: true,
    summaryUpdated: Boolean(summary),
  };
}

export async function createPortalSession(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const guildId = parseRequiredString(formData.get("guildId"), "guildId");
  const campaignId = parseOptionalInteger(formData.get("campaignId"));
  const status = parsePortalSessionStatus(formData.get("status"));
  const occurredAt = parseOccurredAt(formData.get("occurredAt"));
  const notes = await extractNotes({
    noteText: formData.get("notes"),
    files: formData.getAll("noteFiles"),
  });

  await requireGuildAccess(guildId);

  if (campaignId) {
    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, campaignId), eq(campaigns.guildId, guildId)),
      columns: { id: true },
    });

    if (!campaign) {
      throw new Error("Campaign not found");
    }
  }

  const [newSession] = await db
    .insert(sessions)
    .values(
      buildPortalSessionInsert({ guildId, campaignId, status, occurredAt }),
    )
    .returning();

  if (!newSession) {
    throw new Error("Failed to create session");
  }

  if (notes.length > 0) {
    await insertNotes(newSession.id, user, notes);
  }

  if (status === "completed" && notes.length > 0) {
    await generateSessionSummary(newSession.id);
  }

  revalidatePath("/account/sessions");
  if (newSession.campaignId) {
    revalidatePath(`/account/campaigns/${newSession.campaignId}`);
  }

  return {
    success: true,
    sessionId: newSession.id,
  };
}
