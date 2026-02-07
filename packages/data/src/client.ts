import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as runtimeSchema from "./schema-runtime";

export type RuntimeSchema = typeof runtimeSchema;
export type RuntimeDb = NeonHttpDatabase<RuntimeSchema>;

export function createDbClient<
  TSchema extends Record<string, unknown>,
>(params: {
  schema: TSchema;
  databaseUrl?: string;
}): NeonHttpDatabase<TSchema> {
  const databaseUrl = params.databaseUrl ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(databaseUrl);
  return drizzle(sql, { schema: params.schema });
}

export function createRuntimeDb(databaseUrl?: string): RuntimeDb {
  return createDbClient({
    schema: runtimeSchema,
    databaseUrl,
  });
}
