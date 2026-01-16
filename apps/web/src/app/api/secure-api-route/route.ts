import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (session) {
    return new Response(JSON.stringify({ session }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unauthenticated" }), {
    headers: { "Content-Type": "application/json" },
    status: 401,
  });
}
