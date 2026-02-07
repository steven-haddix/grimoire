import { createDbClient } from "@grimoire/data/client";
import * as schema from "./schema";

export const db = createDbClient({
  schema,
  databaseUrl: process.env.DATABASE_URL,
});
