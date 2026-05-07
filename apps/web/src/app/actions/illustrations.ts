"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import {
  campaigns,
  illustrations,
  sessions,
  summaries,
  transcripts,
} from "@/db/schema";
import { generateIllustration } from "@/lib/agents/image-providers";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";

const STYLE_PREAMBLE = [
  "Create a cinematic fantasy illustration in the style of classic Dungeons & Dragons concept art.",
  "Rich, dramatic lighting. Painterly with bold composition. No text, no UI elements, no watermarks.",
].join("\n");

const TRANSCRIPT_WINDOW = 14;
const SUMMARY_PARAGRAPH_LIMIT = 600;
const USER_PROMPT_LIMIT = 600;

async function assertCampaignAccess(campaignId: number) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) throw new Error("Campaign not found");

  const adminGuilds = await getUserAdminGuilds();
  if (!adminGuilds.some((g) => g.id === campaign.guildId)) {
    throw new Error("Forbidden");
  }
  return campaign;
}

function firstParagraph(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const blocks = trimmed.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const cleaned = block
      .replace(/^#+\s+.*$/gm, "")
      .replace(/^>\s*/gm, "")
      .replace(/^[-*]\s+/gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .trim();
    if (cleaned.length >= 30) {
      return cleaned.length > SUMMARY_PARAGRAPH_LIMIT
        ? `${cleaned.slice(0, SUMMARY_PARAGRAPH_LIMIT)}…`
        : cleaned;
    }
  }
  return null;
}

type SceneContext = {
  scene: string;
  source:
    | "live-transcript"
    | "latest-summary"
    | "campaign-description"
    | "fallback";
  sessionId: number | null;
};

async function deriveCurrentScene(campaignId: number): Promise<SceneContext> {
  // 1. Active session — use the recent transcript window
  const liveSession = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.campaignId, campaignId),
      eq(sessions.status, "active"),
    ),
    orderBy: desc(sessions.startedAt),
  });

  if (liveSession) {
    const recent = await db
      .select({ speaker: transcripts.speaker, content: transcripts.content })
      .from(transcripts)
      .where(eq(transcripts.sessionId, liveSession.id))
      .orderBy(desc(transcripts.timestamp))
      .limit(TRANSCRIPT_WINDOW);
    if (recent.length > 0) {
      const ordered = recent.reverse();
      const lines = ordered
        .map((l) => `${l.speaker}: ${l.content}`)
        .join("\n");
      return {
        scene: `From the table just now:\n${lines}`,
        source: "live-transcript",
        sessionId: liveSession.id,
      };
    }
  }

  // 2. Latest summary — first meaningful paragraph
  const [latestSession] = await db
    .select({ id: sessions.id, startedAt: sessions.startedAt })
    .from(sessions)
    .where(eq(sessions.campaignId, campaignId))
    .orderBy(desc(sessions.startedAt))
    .limit(1);

  if (latestSession) {
    const [latestSummary] = await db
      .select({ text: summaries.text })
      .from(summaries)
      .where(eq(summaries.sessionId, latestSession.id))
      .orderBy(desc(summaries.createdAt))
      .limit(1);
    if (latestSummary) {
      const para = firstParagraph(latestSummary.text);
      if (para) {
        return {
          scene: para,
          source: "latest-summary",
          sessionId: latestSession.id,
        };
      }
    }
  }

  // 3. Campaign description as last resort
  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (campaign?.description?.trim()) {
    return {
      scene: campaign.description.trim(),
      source: "campaign-description",
      sessionId: null,
    };
  }

  return {
    scene: "An evocative establishing shot of a fantasy adventuring party at a moment of quiet tension.",
    source: "fallback",
    sessionId: null,
  };
}

function buildPrompt(scene: string, userPrompt: string | null): string {
  const cleaned = userPrompt?.trim().slice(0, USER_PROMPT_LIMIT) ?? "";
  if (cleaned) {
    return [
      STYLE_PREAMBLE,
      `Scene context (from the campaign):\n${scene}`,
      `User direction: ${cleaned}`,
      "Honour the user direction; let the campaign context provide texture and faces, not the headline subject.",
    ].join("\n\n");
  }
  return [STYLE_PREAMBLE, `Scene: ${scene}`].join("\n\n");
}

function deriveCaption(scene: string, userPrompt: string | null): string {
  const userTrim = userPrompt?.trim();
  if (userTrim) {
    return userTrim.length > 80 ? `${userTrim.slice(0, 80)}…` : userTrim;
  }
  const sceneTrim = scene.replace(/\s+/g, " ").trim();
  const cut = sceneTrim.slice(0, 80);
  return sceneTrim.length > 80 ? `${cut}…` : cut;
}

export async function createIllustration(formData: FormData) {
  const campaignId = Number(formData.get("campaignId"));
  if (!Number.isFinite(campaignId)) throw new Error("Invalid campaign");

  const userPromptRaw = String(formData.get("userPrompt") ?? "").trim();
  const userPrompt = userPromptRaw ? userPromptRaw : null;

  const campaign = await assertCampaignAccess(campaignId);

  const sceneCtx = await deriveCurrentScene(campaignId);
  const finalPrompt = buildPrompt(sceneCtx.scene, userPrompt);
  const caption = deriveCaption(sceneCtx.scene, userPrompt);

  const image = await generateIllustration(finalPrompt);
  const buffer = Buffer.from(image.base64, "base64");

  const [row] = await db
    .insert(illustrations)
    .values({
      campaignId,
      sessionId: sceneCtx.sessionId,
      prompt: finalPrompt,
      userPrompt,
      caption,
      mimeType: image.mimeType,
      data: buffer,
      source: "web",
    })
    .returning();

  revalidatePath(
    `/account/s/${campaign.guildId}/campaigns/${campaignId}/illustrations`,
  );
  revalidatePath(`/account/s/${campaign.guildId}/campaigns/${campaignId}`);

  return {
    id: row?.id,
    source: sceneCtx.source,
  };
}

export async function deleteIllustration(
  illustrationId: number,
  campaignId: number,
) {
  const campaign = await assertCampaignAccess(campaignId);
  await db
    .delete(illustrations)
    .where(
      and(
        eq(illustrations.id, illustrationId),
        eq(illustrations.campaignId, campaignId),
      ),
    );
  revalidatePath(
    `/account/s/${campaign.guildId}/campaigns/${campaignId}/illustrations`,
  );
  revalidatePath(`/account/s/${campaign.guildId}/campaigns/${campaignId}`);
}
