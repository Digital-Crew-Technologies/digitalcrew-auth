// Runs against the build output: `npm test` builds first.
import assert from "node:assert/strict";
import test from "node:test";
import {
  appEnv,
  assertAllowedHost,
  installProductionHostGuard,
  loadAuthEnv,
  ProductionHostError,
} from "../dist/index.js";

const base = {
  DIGITALCREW_AUTH_DATABASE_URL: "postgresql://user:password@localhost:5432/digitalcrew_auth",
  DIGITALCREW_AUTH_SECRET: "x".repeat(32),
};

test("APP_ENV defaults to production and rejects unknown values", () => {
  assert.equal(appEnv({}), "production");
  assert.equal(appEnv({ APP_ENV: "staging" }), "staging");
  assert.throws(() => appEnv({ APP_ENV: "prod" }), /APP_ENV must be one of/);
});

test("staging + production host is refused", () => {
  assert.throws(
    () => assertAllowedHost("https://www.digitalcrew.tech/api/auth", { APP_ENV: "staging" }),
    ProductionHostError,
  );
  assert.throws(
    () => loadAuthEnv({ ...base, APP_ENV: "staging", DIGITALCREW_AUTH_URL: "https://www.digitalcrew.tech" }),
    /DIGITALCREW_AUTH_URL/,
  );
  assert.throws(
    () =>
      loadAuthEnv({
        ...base,
        APP_ENV: "preprod",
        DIGITALCREW_AUTH_URL: "https://www.digitalcrew-preprod.tech",
        DIGITALCREW_AUTH_TRUSTED_ORIGINS: "https://max.digitalcrew-preprod.tech,https://max.digitalcrew.tech",
        DIGITALCREW_AUTH_COOKIE_DOMAIN: ".digitalcrew.tech",
      }),
    (error) => {
      assert.ok(error instanceof ProductionHostError);
      assert.match(error.message, /DIGITALCREW_AUTH_COOKIE_DOMAIN, DIGITALCREW_AUTH_TRUSTED_ORIGINS/);
      return true;
    },
  );
});

test("production + production host is allowed", () => {
  assert.doesNotThrow(() => assertAllowedHost("https://www.digitalcrew.tech", {}));
  const env = loadAuthEnv({
    ...base,
    DIGITALCREW_AUTH_URL: "https://www.digitalcrew.tech",
    DIGITALCREW_AUTH_COOKIE_DOMAIN: ".digitalcrew.tech",
  });
  assert.equal(env.APP_ENV, "production");
  assert.equal(env.DIGITALCREW_AUTH_URL, "https://www.digitalcrew.tech");
});

test("staging + staging host is allowed", () => {
  assert.doesNotThrow(() => assertAllowedHost("https://www.digitalcrew-staging.tech", { APP_ENV: "staging" }));
  const env = loadAuthEnv({
    ...base,
    APP_ENV: "staging",
    DIGITALCREW_AUTH_URL: "https://www.digitalcrew-staging.tech",
    DIGITALCREW_AUTH_TRUSTED_ORIGINS: "https://max.digitalcrew-staging.tech",
    DIGITALCREW_AUTH_COOKIE_DOMAIN: ".digitalcrew-staging.tech",
    // Variables of the host app are its own guard's business, not this package's.
    UNRELATED_URL: "https://max.digitalcrew.tech",
  });
  assert.equal(env.APP_ENV, "staging");
});

test("the fetch guard refuses production hosts before any network call", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response("ok");
  };
  try {
    installProductionHostGuard({});
    await globalThis.fetch("https://www.digitalcrew.tech/ping");
    installProductionHostGuard({ APP_ENV: "staging" });
    await assert.rejects(globalThis.fetch("https://www.digitalcrew.tech/ping"), ProductionHostError);
    await globalThis.fetch("https://www.digitalcrew-staging.tech/ping");
    assert.deepEqual(calls, ["https://www.digitalcrew.tech/ping", "https://www.digitalcrew-staging.tech/ping"]);
  } finally {
    globalThis.fetch = original;
  }
});
