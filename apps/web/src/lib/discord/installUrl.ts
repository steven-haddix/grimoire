type InstallUrlParams = {
  clientId: string;
  guildId?: string;
  permissions?: number;
  redirectUri?: string;
  state?: string;
};

export function buildDiscordBotInstallUrl({
  clientId,
  guildId,
  permissions = 1049600,
  redirectUri,
  state,
}: InstallUrlParams) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "bot applications.commands");
  url.searchParams.set("permissions", String(permissions));

  if (guildId) {
    url.searchParams.set("guild_id", guildId);
    url.searchParams.set("disable_guild_select", "true");
  }

  if (redirectUri) {
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
  }

  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}
