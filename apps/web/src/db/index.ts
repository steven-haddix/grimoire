import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

function isNeonDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export const db = isNeonDatabaseUrl(databaseUrl)
  ? drizzleNeon(neon(databaseUrl), { schema })
  : drizzleNodePg(databaseUrl, { schema });
