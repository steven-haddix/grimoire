import { redirect } from "next/navigation";

export default async function CampaignsListRedirect() {
  redirect("/account");
}
