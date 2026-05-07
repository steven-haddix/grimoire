"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { buildDiscordBotInstallUrl } from "@/lib/discord/installUrl";

type InstallBotButtonProps = {
  guildId?: string;
  className?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "primary" | "ghost" | "secondary" | "outline";
  children?: ReactNode;
};

export function InstallBotButton({
  guildId,
  className,
  size = "default",
  variant = "primary",
  children,
}: InstallBotButtonProps) {
  const appId = process.env.NEXT_PUBLIC_DISCORD_APP_ID;
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!appId) {
    return (
      <span className="t-meta" style={{ color: "var(--rust)" }}>
        Missing Discord app ID configuration.
      </span>
    );
  }

  const installUrl = buildDiscordBotInstallUrl({
    clientId: appId,
    guildId,
    redirectUri: origin
      ? `${origin}/account/campaigns?installed=true`
      : undefined,
  });

  return (
    <Button asChild size={size} variant={variant} className={className}>
      <a href={installUrl} target="_blank" rel="noreferrer">
        {children ?? "Install bot to server"}
      </a>
    </Button>
  );
}
