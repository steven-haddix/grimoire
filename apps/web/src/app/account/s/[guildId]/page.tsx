import { redirect } from "next/navigation";

export default async function ServerHome({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  redirect(`/account/s/${guildId}/campaigns`);
}
