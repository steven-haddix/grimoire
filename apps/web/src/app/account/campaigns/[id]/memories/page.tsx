import { redirect } from "next/navigation";

interface MemoriesRedirectProps {
  params: Promise<{ id: string }>;
}

export default async function MemoriesRedirect(props: MemoriesRedirectProps) {
  const { id } = await props.params;
  redirect(`/account/c/${id}/memories`);
}
