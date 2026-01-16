"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth/client";

export function HomeAuthControls() {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex items-center gap-3 text-sm text-ink/70">
        <span className="h-9 w-24 animate-pulse rounded-lg bg-white/70" />
        <span className="h-9 w-24 animate-pulse rounded-lg bg-white/70" />
      </div>
    );
  }

  if (!data?.session) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href="/auth/sign-in"
          className="rounded-lg bg-ember px-4 py-2 font-semibold text-white shadow-glow transition hover:bg-ember/90"
        >
          Sign in
        </Link>
        <Link
          href="/auth/sign-up"
          className="rounded-lg border border-ink/15 bg-white/70 px-4 py-2 font-semibold text-ink transition hover:bg-white"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const label = data.user?.email ?? data.user?.name ?? data.user?.id ?? "Signed in";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
      <div className="min-w-0 text-ink/80">
        Signed in as <span className="font-semibold text-ink">{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/account/settings"
          className="rounded-lg border border-ink/15 bg-white/70 px-4 py-2 font-semibold text-ink transition hover:bg-white"
        >
          Account
        </Link>
        <button
          type="button"
          className="rounded-lg bg-ink px-4 py-2 font-semibold text-white transition hover:bg-ink/90"
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
