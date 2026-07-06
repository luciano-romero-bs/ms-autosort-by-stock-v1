import { test } from "node:test";
import assert from "node:assert/strict";

// getEnv() reads process.env lazily, so setting these before importing the
// module under test is enough — no real Shopify/Supabase access needed.
process.env.SHOPIFY_SHOP = "test-shop.myshopify.com";
process.env.SHOPIFY_ADMIN_TOKEN = "test-token";
process.env.SHOPIFY_API_VERSION = "2025-10";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "test-key";
process.env.CRON_SECRET = "test-secret";
process.env.PANEL_USER = "admin";
process.env.PANEL_PASS = "pass";

const { getCollectionProducts, reorderCollection } = await import("../lib/shopifyClient.js");

function jsonResponse(body, status = 200) {
  return { status, json: async () => body };
}

test("getCollectionProducts paginates until hasNextPage is false", async (t) => {
  const cursorsSeen = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    const body = JSON.parse(opts.body);
    cursorsSeen.push(body.variables.cursor ?? null);
    if (!body.variables.cursor) {
      return jsonResponse({
        data: {
          collection: {
            title: "Test Collection",
            sortOrder: "MANUAL",
            products: {
              pageInfo: { hasNextPage: true, endCursor: "cursor1" },
              nodes: [{ id: "1", title: "A", totalInventory: 5, productType: "x" }],
            },
          },
        },
      });
    }
    return jsonResponse({
      data: {
        collection: {
          title: "Test Collection",
          sortOrder: "MANUAL",
          products: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [{ id: "2", title: "B", totalInventory: 2, productType: "y" }],
          },
        },
      },
    });
  });

  const result = await getCollectionProducts("gid://shopify/Collection/1");
  assert.equal(result.title, "Test Collection");
  assert.equal(result.isManual, true);
  assert.equal(result.products.length, 2);
  assert.deepEqual(cursorsSeen, [null, "cursor1"]);
});

test("getCollectionProducts throws when the collection doesn't exist", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse({ data: { collection: null } }));
  await assert.rejects(() => getCollectionProducts("gid://shopify/Collection/999"), /no existe/);
});

test("reorderCollection sends the mutation then polls the job until done", async (t) => {
  const sequence = [];
  let jobPollCount = 0;
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.query.includes("collectionReorderProducts")) {
      sequence.push("mutation");
      return jsonResponse({
        data: { collectionReorderProducts: { job: { id: "job-1" }, userErrors: [] } },
      });
    }
    sequence.push("job-poll");
    jobPollCount += 1;
    return jsonResponse({ data: { job: { id: "job-1", done: jobPollCount >= 2 } } });
  });

  await reorderCollection("gid://shopify/Collection/1", [[{ id: "1", newPosition: "0" }]]);
  assert.deepEqual(sequence, ["mutation", "job-poll", "job-poll"]);
});

test("reorderCollection processes batches sequentially, one job at a time", async (t) => {
  const sequence = [];
  t.mock.method(globalThis, "fetch", async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.query.includes("collectionReorderProducts")) {
      const jobId = `job-${sequence.filter((s) => s.startsWith("mutation")).length + 1}`;
      sequence.push(`mutation:${jobId}`);
      return jsonResponse({
        data: { collectionReorderProducts: { job: { id: jobId }, userErrors: [] } },
      });
    }
    sequence.push(`job-poll:${body.variables.id}`);
    return jsonResponse({ data: { job: { id: body.variables.id, done: true } } });
  });

  await reorderCollection("gid://shopify/Collection/1", [
    [{ id: "1", newPosition: "0" }],
    [{ id: "2", newPosition: "1" }],
  ]);

  assert.deepEqual(sequence, ["mutation:job-1", "job-poll:job-1", "mutation:job-2", "job-poll:job-2"]);
});

test("reorderCollection throws when the mutation returns userErrors", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonResponse({
      data: {
        collectionReorderProducts: { job: null, userErrors: [{ field: "id", message: "boom" }] },
      },
    })
  );

  await assert.rejects(
    () => reorderCollection("gid://shopify/Collection/1", [[{ id: "1", newPosition: "0" }]]),
    /boom/
  );
});

test("shopifyGraphQL throws a clear error on 401", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonResponse({}, 401));
  await assert.rejects(() => getCollectionProducts("gid://shopify/Collection/1"), /401/);
});
