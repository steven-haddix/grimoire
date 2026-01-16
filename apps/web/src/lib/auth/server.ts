import { createAuthServer } from "@neondatabase/auth/next/server";

let cachedAuthServer: ReturnType<typeof createAuthServer> | null = null;

export function getAuthServer() {
  cachedAuthServer ??= createAuthServer();
  return cachedAuthServer;
}
