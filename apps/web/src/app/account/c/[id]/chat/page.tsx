import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { campaigns, webChatMessages } from "@/db/schema";
import {
  rowsToUIMessages,
  WEB_CHAT_HISTORY_LIMIT,
} from "@/lib/agents/web-chat-messages";
import { auth } from "@/lib/auth/server";
import { getUserAdminGuilds } from "@/lib/discord/server";
import { ChatView } from "./chat-view";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage(props: ChatPageProps) {
  const params = await props.params;
  const campaignId = parseInt(params.id, 10);
  if (Number.isNaN(campaignId)) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const campaign = await db.query.campaigns.findFirst({
    where: eq(campaigns.id, campaignId),
  });
  if (!campaign) notFound();

  const userGuilds = await getUserAdminGuilds();
  if (!userGuilds.some((g) => g.id === campaign.guildId)) notFound();

  // The user's rolling conversation for this campaign, oldest first.
  const historyRows = await db
    .select({
      id: webChatMessages.id,
      role: webChatMessages.role,
      content: webChatMessages.content,
    })
    .from(webChatMessages)
    .where(
      and(
        eq(webChatMessages.campaignId, campaignId),
        eq(webChatMessages.userId, session.user.id),
      ),
    )
    .orderBy(desc(webChatMessages.createdAt), desc(webChatMessages.id))
    .limit(WEB_CHAT_HISTORY_LIMIT)
    .then((rows) => rows.reverse());

  return (
    <div className="chat-shell">
      <ChatView
        campaignId={campaignId}
        campaignName={campaign.name}
        initialMessages={rowsToUIMessages(historyRows)}
      />
    </div>
  );
}
