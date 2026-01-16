"use client";

import type { ReactNode } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

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
    <Button
      type="button"
      className={className}
      onClick={async () => {
        await authClient.signIn.social({
          provider: "discord",
          callbackURL,
          scopes: ["identify", "email", "guilds"]
        });
      }}
    >
      {children ?? "Continue with Discord"}
    </Button>
  );
}
