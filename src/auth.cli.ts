import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Used only by `npm run auth:generate` (Better Auth CLI). Keep plugin list in sync with `createAuth`.
 */
const url =
  process.env.DIGITALCREW_AUTH_DATABASE_URL ??
  "postgresql://127.0.0.1:5432/postgres";
const client = postgres(url);
const db = drizzle(client);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  baseURL: process.env.DIGITALCREW_AUTH_URL ?? "http://localhost:3000",
  secret:
    process.env.DIGITALCREW_AUTH_SECRET ??
    "01234567890123456789012345678901",
  emailAndPassword: {
    enabled: true,
  },
  plugins: [organization()],
});
