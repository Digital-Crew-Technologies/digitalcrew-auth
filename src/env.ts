import { z } from "zod";
import { appEnv, assertNoProductionHostsInEnv, type AppEnv } from "./app-env.js";

/**
 * Raw process env before normalization.
 * Postgres URL must be set as `DIGITALCREW_AUTH_DATABASE_URL`.
 */
const envSchemaRaw = z
  .object({
    DIGITALCREW_AUTH_DATABASE_URL: z.string().min(1),
    DIGITALCREW_AUTH_SECRET: z.string().min(32),
    DIGITALCREW_AUTH_URL: z.string().url(),
    DIGITALCREW_AUTH_TRUSTED_ORIGINS: z
      .string()
      .optional()
      .transform((v) =>
        v
          ? v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
      ),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    DIGITALCREW_AUTH_COOKIE_DOMAIN: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
    /** production (default) | preprod | staging. See src/app-env.ts. */
    APP_ENV: z.string().optional(),

    AUTH_MAX_ORGANIZATIONS_PER_USER: z.coerce
      .number()
      .int()
      .positive()
      .optional(),
    AUTH_MAX_MEMBERS_PER_ORGAN: z.coerce.number().int().positive().optional(),
    AUTH_ALLOW_USER_CREATE_ORGAN: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => (v === undefined ? true : v === "true")),
  })
  .refine(
    (e) => Boolean(e.GOOGLE_CLIENT_ID) === Boolean(e.GOOGLE_CLIENT_SECRET),
    {
      message:
        "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or omit both.",
      path: ["GOOGLE_CLIENT_ID"],
    },
  );

export type DigitalcrewAuthEnv = Omit<
  z.infer<typeof envSchemaRaw>,
  "DIGITALCREW_AUTH_DATABASE_URL" | "APP_ENV"
> & {
  /** Resolved APP_ENV (`production` when unset). */
  APP_ENV?: AppEnv;
  /** Resolved Postgres URL for Better Auth / Drizzle (from `DIGITALCREW_AUTH_DATABASE_URL`). */
  DATABASE_URL: string;
};

export function loadAuthEnv(
  env: NodeJS.ProcessEnv = process.env,
): DigitalcrewAuthEnv {
  const parsed = envSchemaRaw.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(
      `Invalid auth environment: ${JSON.stringify(msg, null, 2)}`,
    );
  }
  const raw = parsed.data;
  // Outside production, refuse any auth variable that names a production host.
  assertNoProductionHostsInEnv(
    Object.fromEntries(
      Object.entries(env).filter(
        ([name]) => name === "APP_ENV" || name.startsWith("DIGITALCREW_AUTH_"),
      ),
    ),
  );
  const databaseUrl = raw.DIGITALCREW_AUTH_DATABASE_URL;
  const { DIGITALCREW_AUTH_DATABASE_URL: _a, APP_ENV: _e, ...rest } = raw;
  return {
    ...rest,
    APP_ENV: appEnv(env),
    DATABASE_URL: databaseUrl,
  };
}

export function trustedOriginsFromEnv(env: DigitalcrewAuthEnv): string[] {
  const fromList = env.DIGITALCREW_AUTH_TRUSTED_ORIGINS ?? [];
  const base = env.DIGITALCREW_AUTH_URL;
  const merged = new Set([base, ...fromList]);
  return [...merged];
}
