import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { sessions } from "@/db/schema";

interface SessionRedirectProps {
  params: Promise<{ id: string }>;
}

export default async function SessionRedirect(props: SessionRedirectProps) {
  const { id } = await props.params;
  const sessionId = parseInt(id, 10);
  if (Number.isNaN(sessionId)) notFound();

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
  });
  if (!session) notFound();

  redirect(`/account/s/${session.guildId}/sessions/${session.id}`);
}
