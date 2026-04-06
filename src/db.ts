import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { DigitalcrewAuthEnv } from "./env.js";
import * as schema from "./schema/auth.js";

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema });
}

export type AuthDb = ReturnType<typeof createDb>;

let _db: AuthDb | undefined;

export function getDb(env: DigitalcrewAuthEnv): AuthDb {
  if (!_db) {
    _db = createDb(env.DATABASE_URL);
  }
  return _db;
}
