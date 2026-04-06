import { z } from "zod";

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
  "DIGITALCREW_AUTH_DATABASE_URL"
> & {
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
  const databaseUrl = raw.DIGITALCREW_AUTH_DATABASE_URL;
  const { DIGITALCREW_AUTH_DATABASE_URL: _a, ...rest } = raw;
  return {
    ...rest,
    DATABASE_URL: databaseUrl,
  };
}

export function trustedOriginsFromEnv(env: DigitalcrewAuthEnv): string[] {
  const fromList = env.DIGITALCREW_AUTH_TRUSTED_ORIGINS ?? [];
  const base = env.DIGITALCREW_AUTH_URL;
  const merged = new Set([base, ...fromList]);
  return [...merged];
}
