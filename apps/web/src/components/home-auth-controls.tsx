"use client";

import Link from "next/link";
import { DiscordSignInButton } from "@/components/auth/discord-sign-in-button";
import { Diamond } from "@/components/grimoire/marks";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function HomeAuthControls() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: 0.5,
        }}
      >
        <span className="t-meta">loading…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <DiscordSignInButton className="px-5 py-3 text-[12px]">
        <Diamond size={6} /> Continue with Discord
      </DiscordSignInButton>
    );
  }

  const label =
    session.user?.email ??
    session.user?.name ??
    session.user?.id ??
    "Signed in";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <span className="t-meta">
        signed in as{" "}
        <span style={{ color: "var(--bone)" }}>{label}</span>
      </span>
      <Button asChild variant="primary">
        <Link href="/account">
          <Diamond size={5} /> Open scribe
        </Link>
      </Button>
    </div>
  );
}
