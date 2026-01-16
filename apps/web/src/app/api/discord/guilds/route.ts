import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Minimal perms check: treat “Admin OR Manage Guild” as portal admin
// (Discord returns `permissions` in the guild list response.)
const hasAdminPerms = (permissions: string) => {
  const p = BigInt(permissions);
  const ADMIN = 0x8n;        // Administrator
  const MANAGE_GUILD = 0x20n; // Manage Guild
  return (p & ADMIN) !== 0n || (p & MANAGE_GUILD) !== 0n;
};

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Get a valid Discord user access token (refreshed if needed)
  const tokenRes = await auth.api.getAccessToken({
    body: { providerId: "discord", userId: session.user.id },
    headers: await headers(),
  });

  const accessToken = (tokenRes as any)?.accessToken;
  if (!accessToken) return new Response("No Discord token", { status: 400 });

  // Use Discord API: /users/@me/guilds requires the `guilds` scope
  const res = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return new Response(await res.text(), { status: res.status });

  const guilds: Array<{ id: string; name: string; permissions: string }> =
    await res.json();

  return Response.json({
    guilds: guilds.filter((g) => hasAdminPerms(g.permissions)),
  });
}
