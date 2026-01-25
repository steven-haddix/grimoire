"use client";

import { Button } from "@/components/ui/button";
import { buildDiscordBotInstallUrl } from "@/lib/discord/installUrl";
import { useEffect, useState } from "react";

type InstallBotButtonProps = {
  guildId?: string;
};

export function InstallBotButton({ guildId }: InstallBotButtonProps) {
  const appId = process.env.NEXT_PUBLIC_DISCORD_APP_ID;
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!appId) {
    return (
      <p className="text-xs text-destructive">
        Missing Discord app ID configuration.
      </p>
    );
  }

  const installUrl = buildDiscordBotInstallUrl({
    clientId: appId,
    guildId,
    redirectUri: origin ? `${origin}/account/campaigns?installed=true` : undefined,
  });

  return (
    <Button asChild>
      <a href={installUrl} target="_blank" rel="noreferrer">
        Install bot to server
      </a>
    </Button>
  );
}
