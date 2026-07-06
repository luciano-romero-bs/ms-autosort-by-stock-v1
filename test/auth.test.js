import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SHOPIFY_SHOP = "test-shop.myshopify.com";
process.env.SHOPIFY_ADMIN_TOKEN = "test-token";
process.env.SHOPIFY_API_VERSION = "2025-10";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "test-key";
process.env.CRON_SECRET = "test-cron-secret";
process.env.PANEL_USER = "admin";
process.env.PANEL_PASS = "s3cret";

const { requireBasicAuth, requireCronAuth } = await import("../lib/auth.js");

function basicAuthHeader(user, pass) {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

test("requireBasicAuth rejects a request with no Authorization header", () => {
  const res = mockRes();
  const ok = requireBasicAuth({ headers: {} }, res);
  assert.equal(ok, false);
  assert.equal(res.statusCode, 401);
});

test("requireBasicAuth rejects wrong credentials", () => {
  const res = mockRes();
  const ok = requireBasicAuth({ headers: { authorization: basicAuthHeader("admin", "wrong") } }, res);
  assert.equal(ok, false);
  assert.equal(res.statusCode, 401);
});

test("requireBasicAuth accepts the right credentials", () => {
  const res = mockRes();
  const ok = requireBasicAuth({ headers: { authorization: basicAuthHeader("admin", "s3cret") } }, res);
  assert.equal(ok, true);
  assert.equal(res.statusCode, null);
});

test("requireCronAuth rejects a request with no secret", () => {
  const res = mockRes();
  const ok = requireCronAuth({ headers: {} }, res);
  assert.equal(ok, false);
  assert.equal(res.statusCode, 401);
});

test("requireCronAuth accepts the Vercel-style Bearer header", () => {
  const res = mockRes();
  const ok = requireCronAuth({ headers: { authorization: "Bearer test-cron-secret" } }, res);
  assert.equal(ok, true);
});

test("requireCronAuth accepts the legacy X-Cron-Secret header", () => {
  const res = mockRes();
  const ok = requireCronAuth({ headers: { "x-cron-secret": "test-cron-secret" } }, res);
  assert.equal(ok, true);
});

test("requireCronAuth rejects a wrong secret in either form", () => {
  const bearerRes = mockRes();
  assert.equal(requireCronAuth({ headers: { authorization: "Bearer nope" } }, bearerRes), false);

  const legacyRes = mockRes();
  assert.equal(requireCronAuth({ headers: { "x-cron-secret": "nope" } }, legacyRes), false);
});
