"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { DiscordSignInButton } from "@/components/auth/discord-sign-in-button";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function HomeAuthControls() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <DiscordSignInButton className="font-semibold shadow-glow">
          Continue with Discord
        </DiscordSignInButton>
      </div>
    );
  }

  const label =
    session.user?.email ??
    session.user?.name ??
    session.user?.id ??
    "Signed in";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm shadow-sm">
      <div className="min-w-0 text-muted-foreground">
        Signed in as <span className="font-semibold text-foreground">{label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild className="bg-background/50">
          <Link href="/account">Account</Link>
        </Button>
        <Button
          variant="default" // Using primary (ember) for sign out if desired, or secondary? Original was bg-ink (black/brown).
          // Actually, let's use 'secondary' for sign out to be less aggressive than 'primary' (ember), 
          // or 'ghost'. The original was bg-ink, which is effectively "primary" in some themes, but our primary is Ember.
          // Let's stick to the theme: Primary = Action. Sign Out is an action.
          // But maybe we want it less prominent?
          // Let's use 'secondary' for now.
          className="bg-foreground text-background hover:bg-foreground/90" // Custom override to match original "ink" button
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}
