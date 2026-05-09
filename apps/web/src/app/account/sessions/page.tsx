import { redirect } from "next/navigation";

export default async function SessionsListRedirect() {
  redirect("/account");
}
