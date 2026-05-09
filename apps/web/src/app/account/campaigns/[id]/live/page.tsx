import { redirect } from "next/navigation";

interface LiveRedirectProps {
  params: Promise<{ id: string }>;
}

export default async function LiveRedirect(props: LiveRedirectProps) {
  const { id } = await props.params;
  redirect(`/account/c/${id}/live`);
}
