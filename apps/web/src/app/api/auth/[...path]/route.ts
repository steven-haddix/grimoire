import { authApiHandler } from "@neondatabase/auth/next/server";
import type { NextRequest } from "next/server";

type AuthRouteContext = {
  params: {
    path: string[];
  };
};

function getHandler() {
  return authApiHandler();
}

type NextRouteContext = {
  params: Promise<AuthRouteContext["params"]>;
};

export async function GET(req: NextRequest, ctx: NextRouteContext) {
  try {
    return await getHandler().GET(req, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(req: NextRequest, ctx: NextRouteContext) {
  try {
    return await getHandler().POST(req, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
