type InstallUrlParams = {
  clientId: string;
  guildId?: string;
  permissions?: number;
  redirectUri?: string;
  state?: string;
};

export const DEFAULT_BOT_INSTALL_PERMISSIONS =
  1024 + // ViewChannel
  2048 + // SendMessages
  32768 + // AttachFiles
  1048576 + // Connect
  2097152; // Speak

export function buildDiscordBotInstallUrl({
  clientId,
  guildId,
  permissions = DEFAULT_BOT_INSTALL_PERMISSIONS,
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
