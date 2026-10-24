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

test("the fetch guard checks every redirect hop", async () => {
  const original = globalThis.fetch;
  const calls = [];
  const redirects = {
    "https://a.example/to-prod": [302, "https://max.digitalcrew.tech/steal"],
    "https://a.example/relative-to-prod": [301, "//www.digitalcrew.tech/"],
    "https://a.example/post": [303, "https://b.example/done"],
    "https://a.example/keep-post": [307, "https://a.example/kept"],
    "https://a.example/cross-origin": [302, "https://b.example/next"],
    "https://a.example/loop": [302, "https://a.example/loop"],
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = init.body === undefined ? null : new TextDecoder().decode(typeof init.body === "string" ? new TextEncoder().encode(init.body) : init.body);
    calls.push({ url, method: init.method ?? "GET", redirect: init.redirect, body, authorization: headers.get("authorization") });
    const hop = redirects[url];
    if (hop && init.redirect === "manual") return new Response(null, { status: hop[0], headers: { location: hop[1] } });
    return new Response("ok");
  };
  try {
    installProductionHostGuard({ APP_ENV: "staging" });

    await assert.rejects(globalThis.fetch("https://a.example/to-prod"), ProductionHostError);
    await assert.rejects(globalThis.fetch("https://a.example/relative-to-prod"), ProductionHostError);
    assert.deepEqual(calls.map((c) => c.url), ["https://a.example/to-prod", "https://a.example/relative-to-prod"], "production is never called");

    calls.length = 0;
    const res = await globalThis.fetch("https://a.example/post", { method: "POST", body: "x", headers: { "content-type": "text/plain" } });
    assert.equal(await res.text(), "ok");
    assert.deepEqual(calls.map((c) => [c.url, c.method, c.body]), [["https://a.example/post", "POST", "x"], ["https://b.example/done", "GET", null]]);

    calls.length = 0;
    await globalThis.fetch(new Request("https://a.example/keep-post", { method: "POST", body: "y" }));
    assert.deepEqual(calls.map((c) => [c.url, c.method, c.body]).at(-1), ["https://a.example/kept", "POST", "y"], "307 keeps the method and body");

    calls.length = 0;
    await globalThis.fetch("https://a.example/cross-origin", { headers: { authorization: "Bearer t" } });
    assert.deepEqual(calls.map((c) => c.authorization), ["Bearer t", null], "a cross-origin hop drops credentials");

    await assert.rejects(globalThis.fetch("https://a.example/loop"), /more than 20 redirects/);

    calls.length = 0;
    const manual = await globalThis.fetch("https://a.example/to-prod", { redirect: "manual" });
    assert.equal(manual.status, 302, "redirect: 'manual' is passed through");
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
