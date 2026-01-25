import { getUserAdminGuilds } from "@/lib/discord/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const guilds = await getUserAdminGuilds();
  
  if (guilds.length === 0) {
    // Note: This could also mean unauthorized if not session, 
    // but the utility handles session check and returns []
    // If you need more granular error handling, we could adjust the utility.
  }

  return Response.json({ guilds });
}
