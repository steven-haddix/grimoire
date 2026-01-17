"use client";

import { Button } from "@/components/ui/button";
import { buildDiscordBotInstallUrl } from "@/lib/discord/installUrl";

type InstallBotButtonProps = {
  guildId?: string;
};

export function InstallBotButton({ guildId }: InstallBotButtonProps) {
  const appId = process.env.NEXT_PUBLIC_DISCORD_APP_ID;

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
  });

  return (
    <Button asChild>
      <a href={installUrl} target="_blank" rel="noreferrer">
        Install bot to server
      </a>
    </Button>
  );
}
