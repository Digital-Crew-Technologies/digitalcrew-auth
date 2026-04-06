import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import type { DigitalcrewAuthEnv } from "./env.js";
import { loadAuthEnv, trustedOriginsFromEnv } from "./env.js";
import { getDb } from "./db.js";
import * as schema from "./schema/auth.js";
import { digitalcrewOrganization } from "./tenant.js";

export function createAuth(env: DigitalcrewAuthEnv) {
  const db = getDb(env);
  const isProd = env.NODE_ENV === "production";
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    secret: env.DIGITALCREW_AUTH_SECRET,
    baseURL: env.DIGITALCREW_AUTH_URL,
    trustedOrigins: trustedOriginsFromEnv(env),

    advanced: {
      crossSubDomainCookies: env.DIGITALCREW_AUTH_COOKIE_DOMAIN
        ? {
            enabled: true,
            domain: env.DIGITALCREW_AUTH_COOKIE_DOMAIN,
          }
        : undefined,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        path: "/",
      },
    },

    emailAndPassword: {
      enabled: true,
    },

    socialProviders: google,

    session: {
      expiresIn: 60 * 60 * 24 * 30,
    },

    plugins: [digitalcrewOrganization(env), nextCookies()],
  });
}

let _auth: ReturnType<typeof createAuth> | undefined;

export function getAuth(): ReturnType<typeof createAuth> {
  if (!_auth) {
    _auth = createAuth(loadAuthEnv());
  }
  return _auth;
}
