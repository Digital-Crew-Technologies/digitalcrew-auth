#!/usr/bin/env node
import { config as loadDotenv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, "..", "..", "drizzle");

function loadEnvFromAppRoot(): void {
  const cwd = process.cwd();
  loadDotenv({ path: join(cwd, ".env") });
  loadDotenv({ path: join(cwd, ".env.local"), override: true });
}

function printHelp(): void {
  console.log(`digitalcrew-auth — apply @digitalcrew/auth database migrations (Drizzle)

Usage:
  npx digitalcrew-auth
  npx digitalcrew-auth migrate

Environment:
  DIGITALCREW_AUTH_DATABASE_URL — Postgres connection string

The CLI loads .env then .env.local from the current working directory (same idea as Next.js),
without overriding variables already set in your shell.

Note: "npx auth@latest migrate" only applies when using Better Auth's built-in Kysely adapter.
@digitalcrew/auth uses Drizzle; use this command instead.`);
}

async function main(): Promise<void> {
  loadEnvFromAppRoot();

  const cmd = process.argv[2];
  if (cmd === "-h" || cmd === "--help") {
    printHelp();
    return;
  }
  if (cmd && cmd !== "migrate") {
    console.error(`Unknown argument: ${cmd}\n`);
    printHelp();
    process.exit(1);
  }

  const url = process.env.DIGITALCREW_AUTH_DATABASE_URL;
  if (!url?.trim()) {
    console.error(
      [
        "Missing DIGITALCREW_AUTH_DATABASE_URL.",
        `Looked for .env / .env.local under cwd: ${process.cwd()}`,
        "Export the variable in your shell, or add it to .env in the app root and run this command from that directory.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder });
    console.log("@digitalcrew/auth: migrations applied.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
