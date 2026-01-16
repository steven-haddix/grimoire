"use client";

import type { ReactNode } from "react";
import { authClient } from "@/lib/auth/client";

type DiscordSignInButtonProps = {
  callbackURL?: string;
  className?: string;
  children?: ReactNode;
};

export function DiscordSignInButton({
  callbackURL = "/account",
  className,
  children
}: DiscordSignInButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await authClient.signIn.social({
          provider: "discord",
          callbackURL
        });
      }}
    >
      {children ?? "Continue with Discord"}
    </button>
  );
}
