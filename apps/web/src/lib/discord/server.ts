import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { cache } from "@/lib/cache";

export interface DiscordGuild {
  id: string;
  name: string;
  permissions: string;
  icon: string | null;
}

const hasAdminPerms = (permissions: string) => {
  const p = BigInt(permissions);
  const ADMIN = 0x8n; // Administrator
  const MANAGE_GUILD = 0x20n; // Manage Guild
  return (p & ADMIN) !== 0n || (p & MANAGE_GUILD) !== 0n;
};

const getCachedAdminGuilds = async (
  accessToken: string,
): Promise<DiscordGuild[]> => {
  const cacheKey = `discord:admin-guilds:${accessToken}`;
  const cached = await cache.get<DiscordGuild[]>(cacheKey);

  if (cached) {
    return cached;
  }

  const res = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Discord API error: ${res.status} ${res.statusText}`);
  }

  const guilds: DiscordGuild[] = await res.json();
  const adminGuilds = guilds.filter((g) => hasAdminPerms(g.permissions));

  await cache.set(cacheKey, adminGuilds, 300);
  return adminGuilds;
};

export async function getUserAdminGuilds(): Promise<DiscordGuild[]> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return [];
  }

  // Get a valid Discord user access token (refreshed if needed)
  const tokenRes = await auth.api.getAccessToken({
    body: { providerId: "discord", userId: session.user.id },
    headers: await headers(),
  });

  const accessToken = tokenRes?.accessToken;
  if (!accessToken) return [];

  try {
    return await getCachedAdminGuilds(accessToken);
  } catch (error) {
    console.error("Failed to fetch user guilds from Discord:", error);
    return [];
  }
}

export async function invalidateUserAdminGuildsCache() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return;
  }

  const tokenRes = await auth.api.getAccessToken({
    body: { providerId: "discord", userId: session.user.id },
    headers: await headers(),
  });

  const accessToken = tokenRes?.accessToken;
  if (!accessToken) return;

  await cache.delete(`discord:admin-guilds:${accessToken}`);
}
