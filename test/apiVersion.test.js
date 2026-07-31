import test from "node:test";
import assert from "node:assert/strict";
import { pickNewestStable, resolveApiVersion, DEFAULT_API_VERSION } from "../lib/apiVersion.js";

test("pickNewestStable takes the newest dated handle", () => {
  assert.equal(pickNewestStable(["2025-10", "2026-07", "2026-01", "2026-04"]), "2026-07");
});

test("pickNewestStable ignores unstable and anything not YYYY-MM", () => {
  assert.equal(pickNewestStable(["2026-04", "unstable", "latest", "release-candidate"]), "2026-04");
});

test("pickNewestStable crosses the year boundary correctly", () => {
  assert.equal(pickNewestStable(["2026-10", "2027-01"]), "2027-01");
});

test("pickNewestStable returns null when there's nothing usable", () => {
  assert.equal(pickNewestStable(["unstable"]), null);
  assert.equal(pickNewestStable([]), null);
  assert.equal(pickNewestStable(undefined), null);
});

// Cada test usa un shopDomain distinto para no cruzarse con el cache de 6hs.
function stubFetch(t, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = original;
  });
}

test("resolveApiVersion picks the newest supported version Shopify reports", async (t) => {
  stubFetch(t, async () => ({
    ok: true,
    json: async () => ({
      api_versions: [
        { handle: "2025-10", supported: true },
        { handle: "2026-07", supported: true },
        { handle: "unstable", supported: true },
      ],
    }),
  }));

  assert.equal(await resolveApiVersion("shop-a.myshopify.com", "token", "2025-10"), "2026-07");
});

test("resolveApiVersion ignores versions Shopify no longer supports", async (t) => {
  stubFetch(t, async () => ({
    ok: true,
    json: async () => ({
      api_versions: [
        { handle: "2026-04", supported: true },
        { handle: "2027-01", supported: false },
      ],
    }),
  }));

  assert.equal(await resolveApiVersion("shop-b.myshopify.com", "token", "2025-10"), "2026-04");
});

test("resolveApiVersion never goes below the configured floor", async (t) => {
  stubFetch(t, async () => ({
    ok: true,
    json: async () => ({ api_versions: [{ handle: "2024-01", supported: true }] }),
  }));

  assert.equal(await resolveApiVersion("shop-c.myshopify.com", "token", "2026-07"), "2026-07");
});

test("resolveApiVersion falls back to the stored version when Shopify won't say", async (t) => {
  stubFetch(t, async () => ({ ok: false, status: 404 }));

  assert.equal(await resolveApiVersion("shop-d.myshopify.com", "token", "2026-04"), "2026-04");
});

test("resolveApiVersion falls back to the default when there's no stored version", async (t) => {
  stubFetch(t, async () => {
    throw new Error("network down");
  });

  assert.equal(await resolveApiVersion("shop-e.myshopify.com", "token", null), DEFAULT_API_VERSION);
});

test("resolveApiVersion caches per shop instead of asking on every call", async (t) => {
  let calls = 0;
  stubFetch(t, async () => {
    calls += 1;
    return { ok: true, json: async () => ({ api_versions: [{ handle: "2026-07", supported: true }] }) };
  });

  await resolveApiVersion("shop-f.myshopify.com", "token", "2025-10");
  await resolveApiVersion("shop-f.myshopify.com", "token", "2025-10");
  assert.equal(calls, 1);
});
