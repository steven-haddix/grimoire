import { redirect } from "next/navigation";

interface CampaignRedirectProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignRedirect(props: CampaignRedirectProps) {
  const { id } = await props.params;
  redirect(`/account/c/${id}`);
}
