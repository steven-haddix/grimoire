import { getAuthServer } from "@/lib/auth/server";

export async function GET() {
  const { data } = await getAuthServer().getSession();

  if (data?.session) {
    return new Response(JSON.stringify({ session: data.session, user: data.user }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unauthenticated" }), {
    headers: { "Content-Type": "application/json" },
    status: 401,
  });
}
