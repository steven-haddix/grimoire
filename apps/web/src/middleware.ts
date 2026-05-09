import { NextResponse, type NextRequest } from "next/server";

const LAST_CAMPAIGN_COOKIE = "grim-last-campaign";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/account\/c\/(\d+)(?:\/|$)/);
  if (!match) return NextResponse.next();

  const id = match[1];
  if (!id) return NextResponse.next();

  if (request.cookies.get(LAST_CAMPAIGN_COOKIE)?.value === id) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(LAST_CAMPAIGN_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  return response;
}

export const config = {
  matcher: "/account/c/:path*",
};
