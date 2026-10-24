# digitalcrew-auth

Shared authentication for Digital Crew: **Better Auth** on **Postgres** (Neon, RDS, local, etc.) with **Drizzle ORM**. Tenancy is modeled as **organizations** (workspaces): users can belong to several orgs, and the session stores an **active organization** for permissions and for scoping your product data (`organizationId` on your own tables).

Use the same package for a private orchestrator, managed agent SaaS (shared DB + cookies), or open-source self-hosted agents (each deployment still uses its own database and secrets — that is deployment isolation, not org tenancy).

## Requirements

- Node.js 20+
- A Postgres URL for the auth database (see env vars below)
- npm (or pnpm / yarn)

## Repository layout

| Path              | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `src/`            | Source (Better Auth config, Drizzle schema, env helpers)     |
| `src/auth.cli.ts` | Minimal config for the Better Auth schema generator CLI only |
| `drizzle/`        | SQL migrations from Drizzle Kit                              |

## Install in this repo (development)

```bash
npm install
npm run build
```

## Install in a sub-SaaS app (Git dependency)

Point at the repo root. Pin a **branch, tag, or commit** for reproducible installs.

```json
{
  "dependencies": {
    "@digitalcrew/auth": "git+https://github.com/Digital-Crew-Technologies/digitalcrew-auth.git#main"
  }
}
```

Other valid forms:

```json
"@digitalcrew/auth": "git+https://github.com/Digital-Crew-Technologies/digitalcrew-auth.git#v0.1.0"
```

```json
"@digitalcrew/auth": "github:Digital-Crew-Technologies/digitalcrew-auth#main"
```

On install, npm runs the **`prepare`** script (`npm run build`), which compiles TypeScript to `dist/` (because `dist/` is not committed). If you use `npm install --ignore-scripts`, run `npm run build` inside `node_modules/@digitalcrew/auth` yourself, or depend on a **published** package that ships `dist/`.

## Environment variables

Copy `.env.example` to `.env` and set values. They are validated with Zod when you call `loadAuthEnv()` or `getAuth()`.

| Variable                                    | Required      | Description                                                                                                                                               |
| ------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DIGITALCREW_AUTH_DATABASE_URL`             | Yes           | Postgres URL used only by `@digitalcrew/auth`. `loadAuthEnv()` exposes the same value as `DATABASE_URL` on the returned object for Drizzle / Better Auth. |
| `DIGITALCREW_AUTH_SECRET`                   | Yes           | At least 32 characters. Generate with `npx auth@latest secret`                                                                                            |
| `DIGITALCREW_AUTH_URL`                      | Yes           | Public origin of the app that serves the auth API (e.g. `https://app.example.com`)                                                                        |
| `DIGITALCREW_AUTH_TRUSTED_ORIGINS`          | No            | Comma-separated extra origins (CORS / CSRF). `DIGITALCREW_AUTH_URL` is always included                                                                    |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional pair | Omit both, or set both, for Google sign-in                                                                                                                |
| `DIGITALCREW_AUTH_COOKIE_DOMAIN`            | No            | Production SSO across subdomains: root domain with a leading dot, e.g. `.example.com`                                                                     |
| `NODE_ENV`                                  | No            | `development` / `production` / `test` — affects `secure` cookies in production                                                                            |
| `APP_ENV`                                   | No            | `production` (default) / `preprod` / `staging`. Outside production, `loadAuthEnv()` throws if a `DIGITALCREW_AUTH_*` value names a production host (`*.digitalcrew.tech`); see `src/app-env.ts`|
| `AUTH_MAX_ORGANIZATIONS_PER_USER`           | No            | Cap how many organizations a user may create (omit = unlimited)                                                                                           |
| `AUTH_MAX_MEMBERS_PER_ORGAN`                | No            | Member limit per org (default **100** if omitted)                                                                                                         |
| `AUTH_ALLOW_USER_CREATE_ORGAN`              | No            | `true` or `false` — whether end users can create orgs (default **true**). Set `false` if only your orchestrator creates tenants                           |

## Database migrations

### In an app that depends on `@digitalcrew/auth`

After `npm install` / `pnpm install` so `@digitalcrew/auth` is present, use one of:

```bash
npm exec digitalcrew-auth migrate
```

To run the binary via **npx**, you must tell npx which package provides it (only works if `@digitalcrew/auth` is installable from the registry or another source npx understands):

```bash
npx --package @digitalcrew/auth digitalcrew-auth migrate
```

### In this repository (package development)

From the **repository root** (with `DIGITALCREW_AUTH_DATABASE_URL` set):

```bash
npm run db:migrate
```

To create a new migration after you change Drizzle schema files:

```bash
npm run db:generate
```

Review the new files under `drizzle/`, then run `db:migrate` against your database.

## Regenerating the Better Auth schema

When you add or remove **Better Auth plugins**, mirror the same options in `src/auth.cli.ts`, then run:

```bash
npm run auth:generate
```

That overwrites `src/schema/auth.ts`. After that, run `npm run db:generate` and migrate as needed.

## API overview

### Server: `createAuth` vs `getAuth`

- **`createAuth(env)`** — Builds an auth instance from an explicit `DigitalcrewAuthEnv` (from `loadAuthEnv(customProcessEnv)` or your own object). Use this for tests, scripts, or when `process.env` is not the source of truth.

- **`getAuth()`** — Singleton that calls `loadAuthEnv(process.env)`. Convenient for a single deployed app.

Both return a Better Auth instance with `.handler` (Web `Request` → `Response`) and `.api` (programmatic endpoints).

### HTTP adapter: Next.js App Router

Mount the handler on a catch-all route so Better Auth can own `/api/auth/*`.

`app/api/auth/[...all]/route.ts`:

```ts
import { getAuth } from "@digitalcrew/auth";
import { routeHandlers } from "@digitalcrew/auth/http";

const auth = getAuth();

export const { GET, POST } = routeHandlers(auth);
```

Set `DIGITALCREW_AUTH_URL` to the same origin as this app (including port in development).

### Server: read the session

Pass the incoming request headers (cookies) into Better Auth’s session API. Example for Next.js:

```ts
import { getAuth } from "@digitalcrew/auth";
import { headers } from "next/headers";

const auth = getAuth();
const session = await auth.api.getSession({
  headers: await headers(),
});

if (!session) {
  // unauthenticated
}
```

Adapt `headers` to your framework (`Request`, Hono, etc.) — the important part is forwarding `Cookie`.

### Client: sign-in / sign-out

Use the auth client with the **same base URL** as `DIGITALCREW_AUTH_URL` (the app that exposes `/api/auth/*`).

```ts
import { createDigitalcrewAuthClient } from "@digitalcrew/auth";

export const authClient = createDigitalcrewAuthClient(
  process.env.NEXT_PUBLIC_APP_URL!,
);
```

Use Better Auth’s client methods (for example `authClient.signIn.email`, `authClient.signOut`, social methods) as documented in the [Better Auth client docs](https://www.better-auth.com/docs/concepts/client).

### Multi-tenant usage (organizations)

- **Tenant** = **organization** row (`organization` table). Members are in `member`; invites use `invitation`.
- After sign-in, the user should **select or create an org** (or your server creates one). The session exposes **`activeOrganizationId`** (also on the `session` table in Drizzle) for “current workspace”.
- Client: `createDigitalcrewAuthClient` includes the organization plugin — use `authClient.organization.*` (create, list, set active org, invite members, etc.). See [Organization plugin](https://www.better-auth.com/docs/plugins/organization).
- Server: `auth.api` exposes the same capabilities with `headers` for session context.
- **Your product tables** (campaigns, agents, entitlements, …) should include an `organizationId` (or equivalent) foreign key and enforce it in queries using the active org id from `getSession` (field `activeOrganizationId` on the session payload — see Better Auth types in your editor).

Advanced: import `digitalcrewOrganization` from `@digitalcrew/auth` if you need to compose the same plugin options elsewhere (keep behavior aligned with `createAuth`).

### Drizzle database handle

If the same app needs raw queries against the auth database:

```ts
import { getDb, loadAuthEnv } from "@digitalcrew/auth";

const db = getDb(loadAuthEnv());
```

Prefer extending schema in this package and exporting tables from `@digitalcrew/auth` when you add product-specific tables next to auth.

## Scripts (root)

| Script                  | Description                                  |
| ----------------------- | -------------------------------------------- |
| `npm run build`         | Compile `@digitalcrew/auth` to `dist/`       |
| `npm test`              | Build, then run the `node:test` suite        |
| `npm run auth:generate` | Regenerate Drizzle schema from `auth.cli.ts` |
| `npm run db:generate`   | Generate a new Drizzle migration             |
| `npm run db:migrate`    | Apply migrations                             |

## Security notes

- Never commit `.env` or real secrets.
- Use a strong, random `DIGITALCREW_AUTH_SECRET` in every environment.
- In production, serve over HTTPS and keep `NODE_ENV=production` so cookies use `secure: true`.

## Third-party licenses

This project builds on **[Better Auth](https://github.com/better-auth/better-auth)** (MIT). The full copyright and permission notice for that dependency is in [`NOTICE`](./NOTICE) at the repository root. When you redistribute this package or vendor its dependencies, preserve the license files shipped under `node_modules/better-auth` as well.

## Further reading

- [Better Auth documentation](https://www.better-auth.com/docs)
- [Organization plugin](https://www.better-auth.com/docs/plugins/organization)
- [Drizzle Kit](https://orm.drizzle.team/docs/kit-overview)
