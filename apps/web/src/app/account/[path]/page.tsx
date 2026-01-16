import { redirect } from "next/navigation";

export default async function AccountRedirect() {
  redirect("/account");
}
