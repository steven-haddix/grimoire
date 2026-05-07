import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, illustrations } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, context: RouteContext) {
  const authSession = await auth.api.getSession({ headers: await headers() });
  if (!authSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const illustrationId = parseInt(id, 10);
  if (Number.isNaN(illustrationId)) {
    return NextResponse.json(
      { error: "Invalid illustration id" },
      { status: 400 },
    );
  }

  const row = await db.query.illustrations.findFirst({
    where: eq(illustrations.id, illustrationId),
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, row.campaignId),
  });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userGuilds = await getUserAdminGuilds();
  if (!userGuilds.some((g) => g.id === campaign.guildId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // node-pg returns bytea as a Buffer; re-wrap to be safe.
  const buffer = Buffer.isBuffer(row.data)
    ? row.data
    : Buffer.from(row.data as unknown as ArrayBuffer);

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": row.mimeType,
      "Cache-Control": "private, max-age=2592000, immutable",
      "Content-Length": buffer.length.toString(),
    },
  });
}
