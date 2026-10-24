# CLAUDE.md — digitalcrew-auth

## Le dépôt
- Paquet `@digitalcrew/auth` : authentification partagée Digital Crew (Better Auth + Drizzle ORM + Postgres), multi-tenant par organisations (plugin `organization` de Better Auth).
- Consommé par d'autres applications comme dépendance Git (`prepare` lance `npm run build` à l'installation) ; il expose aussi le binaire `digitalcrew-auth migrate`, qui applique `drizzle/` sur la base de l'application cliente.
- TypeScript strict, ESM (`"type": "module"`, `module: NodeNext`) : les imports relatifs gardent l'extension `.js` (`./env.js`).
- Gestionnaire de paquets : npm (`package-lock.json`). Node `>=20` (champ `engines` ; pas de `.nvmrc`).

## Commandes (package.json)
- Installation : `npm ci --legacy-peer-deps` (déclenche `prepare` → build). `npm install` et `npm ci` sans cette option échouent aujourd'hui sur `main` (ERESOLVE : `better-auth` veut `drizzle-kit >=0.31.4` en peer optionnel, le dépôt fixe `^0.30.0`). Ne pas régénérer `package-lock.json` sans demande.
- Build : `npm run build` (`tsc`, sortie dans `dist/`, non versionné).
- Vérification de types sans écrire `dist/` : `npx tsc --noEmit` (pas de script `typecheck` ; passe aujourd'hui).
- `npm run auth:generate` : régénère `src/schema/auth.ts` depuis `src/auth.cli.ts` (via `npx auth@latest`, réseau requis).
- `npm run db:generate` : génère une nouvelle migration Drizzle dans `drizzle/`.
- `npm run db:migrate` / `npm run db:studio` : touchent une vraie base (`DIGITALCREW_AUTH_DATABASE_URL`). Ne pas les lancer sans accord humain.
- Tests: `npm test` (build, then `node --test test/*.test.mjs`, Node's built-in runner).
- CI: `.github/workflows/ci.yml` runs `npm ci`, `tsc --noEmit`, the build, the tests and `npm audit`.
- Missing: no `dev`, `lint` or `typecheck` script, no ESLint/Prettier config.

## Structure
- `src/index.ts` : exports publics (point d'entrée `.`) ; `src/http.ts` : adaptateur `routeHandlers` (export `./http`).
- `src/auth.ts` : `createAuth(env)` / `getAuth()` (cookies, Google optionnel, plugins).
- `src/env.ts` : schéma Zod des variables d'environnement (`loadAuthEnv`).
- `src/tenant.ts` : options du plugin organisation (`digitalcrewOrganization`).
- `src/db.ts` : client Drizzle ; `src/client.ts` : client navigateur.
- `src/schema/auth.ts` : schéma Drizzle généré par `auth:generate`.
- `src/auth.cli.ts` : config minimale utilisée seulement par le générateur Better Auth.
- `src/cli/migrate.ts` : binaire `digitalcrew-auth`.
- `drizzle/` : migrations SQL + `meta/` (journal et snapshots drizzle-kit).

## Règles
- Ne jamais modifier une migration existante de `drizzle/` ni `drizzle/meta/` à la main : elles sont livrées dans le paquet et déjà appliquées chez les applications clientes. Toute évolution passe par une nouvelle migration (`npm run db:generate`), additive (expand/contract : ajouter d'abord, retirer plus tard).
- Ajout ou retrait d'un plugin Better Auth : reporter la même liste dans `src/auth.cli.ts` (le commentaire du fichier l'exige), puis `auth:generate`, puis `db:generate`. Ne pas éditer `src/schema/auth.ts` à la main.
- Nouvelle variable d'environnement : l'ajouter au schéma de `src/env.ts` et au tableau du README ; dans `.env.example`, le nom avec une valeur vide ou factice (aujourd'hui `NODE_ENV` et les `AUTH_*` optionnelles n'y figurent pas).
- Secrets uniquement en valeurs factices dans `.env.example` ; ne jamais lire ni committer `.env` (ignoré par `.gitignore`). Pas d'hôte de prod en dur.
- L'API publique (`src/index.ts`, `exports` de package.json) est utilisée par d'autres dépôts : pas de rupture sans le signaler dans la PR.
- `npm run build` doit passer : une erreur `tsc` casse l'installation chez les applications clientes.
- Tests live in `test/*.test.mjs` and run against the built `dist/`: add or update a test with each behaviour change.

## Flux Git
- Branche `claude/<clé-de-la-carte>-<mot-clé>`, partie de `main`.
- PR vers `main` (branche par défaut) avec relecture humaine.
- Jamais de push sur `main` ni `develop`, jamais de merge, jamais de force-push.
- Before pushing: `npx tsc --noEmit` and `npm test` (there is no lint).
