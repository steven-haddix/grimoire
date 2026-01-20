import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "../../db";
import * as schema from "../../db/schema";

// Dynamically determine the base URL for Vercel preview deployments
const getBaseURL = () => {
  // For Vercel deployments (preview or production)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // Fallback to BETTER_AUTH_URL or localhost
  return process.env.BETTER_AUTH_URL || "http://localhost:3000";
};

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  advanced: {
    database: {
      generateId: "serial",
    },
  },
  baseURL: getBaseURL(),
  trustedOrigins: [
    getBaseURL(),
    "http://localhost:3000",
    "https://www.grimoire.bot",
    "https://*.vercel.app",
  ],
  secret: process.env.BETTER_AUTH_SECRET,
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      // This is the key to request guild membership info
      // Better Auth supports provider `scope` as an array. :contentReference[oaicite:0]{index=0}
      scope: ["identify", "email", "guilds"],
    },
  },
  plugins: [
    nextCookies(), // recommended for Next.js server actions/cookies :contentReference[oaicite:1]{index=1}
  ],
});
