import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { auth } from "@/lib/auth/server";

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/auth/sign-in");
  }

  const label =
    session.user?.email ?? session.user?.name ?? session.user?.id ?? "Adventurer";

  return (
    <main className="container mx-auto flex min-h-screen flex-col items-center justify-center gap-6 p-4 md:p-6">
      <div className="w-full max-w-2xl space-y-6 rounded-3xl border border-ink/10 bg-white/80 p-6 shadow-[0_18px_48px_rgba(42,33,27,0.12)]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ember">
            Account
          </p>
          <h1 className="text-3xl font-semibold text-ink">Welcome, {label}</h1>
          <p className="text-sm text-ink/70">
            Your Discord account is linked for session tracking and recaps.
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-ink/10 bg-parchment/70 p-4 text-sm text-ink/80">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/50">User</p>
            <p className="font-semibold text-ink">{session.user?.name ?? "Unknown"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/50">Email</p>
            <p className="font-semibold text-ink">{session.user?.email ?? "Not provided"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ink/50">User ID</p>
            <p className="font-semibold text-ink">{session.user?.id}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <SignOutButton className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink/90" />
        </div>
      </div>
    </main>
  );
}
