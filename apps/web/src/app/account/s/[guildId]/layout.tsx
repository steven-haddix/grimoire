import { notFound } from "next/navigation";
import { getUserAdminGuilds } from "@/lib/discord/server";

export default async function ServerScopedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const userGuilds = await getUserAdminGuilds();
  if (!userGuilds.some((g) => g.id === guildId)) {
    notFound();
  }
  return <>{children}</>;
}
