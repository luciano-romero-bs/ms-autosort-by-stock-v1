import { test } from "node:test";
import assert from "node:assert/strict";
import { sortCollection, UNCATEGORIZED, isManualOrderEnabled } from "../shared/sortCollection.mjs";

const GROUP_ORDER = [
  "accesorios-bufandas-panuelos",
  "accesorios-sombreros-gorros",
  "calzado-sneakers",
  "vestimenta-jeans",
  "vestimenta-poleras",
  "vestimenta-sweaters",
];

// Inspired by the "HASTA 60%OFF" example in design.md section 6.
function baseProducts() {
  return [
    { id: "jean-351", title: "JEAN 351", totalInventory: 49, productType: "vestimenta-jeans" },
    { id: "jean-332", title: "JEAN 332", totalInventory: 5, productType: "vestimenta-jeans" },
    { id: "bufanda-a", title: "BUFANDA A", totalInventory: 10, productType: "accesorios-bufandas-panuelos" },
    { id: "gorro-b", title: "GORRO B", totalInventory: 8, productType: "accesorios-sombreros-gorros" },
    { id: "sneaker-x", title: "SNEAKER X", totalInventory: 20, productType: "calzado-sneakers" },
    { id: "sneaker-a", title: "SNEAKER A", totalInventory: 20, productType: "calzado-sneakers" },
    { id: "polera-c", title: "POLERA C", totalInventory: 15, productType: "vestimenta-poleras" },
    { id: "sweater-d", title: "SWEATER D", totalInventory: 12, productType: "vestimenta-sweaters" },
  ];
}

test("groups by productType in the configured order", () => {
  const { finalOrder } = sortCollection(baseProducts(), GROUP_ORDER, 0);
  assert.deepEqual(finalOrder, [
    "bufanda-a",
    "gorro-b",
    "sneaker-a", // tie on inventory (20) with sneaker-x, wins alphabetically
    "sneaker-x",
    "jean-351",
    "jean-332",
    "polera-c",
    "sweater-d",
  ]);
});

test("within a group, sorts by totalInventory desc then title asc as tiebreak", () => {
  const products = [
    { id: "a", title: "B PRODUCT", totalInventory: 10, productType: "x" },
    { id: "b", title: "A PRODUCT", totalInventory: 10, productType: "x" },
    { id: "c", title: "C PRODUCT", totalInventory: 3, productType: "x" },
  ];
  const { finalOrder } = sortCollection(products, ["x"], 0);
  assert.deepEqual(finalOrder, ["b", "a", "c"]);
});

test("threshold 0 (or omitted) sends nothing to the bottom", () => {
  const products = [
    { id: "a", title: "A", totalInventory: 0, productType: "x" },
    { id: "b", title: "B", totalInventory: 5, productType: "x" },
  ];
  const withZero = sortCollection(products, ["x"], 0);
  const withUndefined = sortCollection(products, ["x"], undefined);
  assert.deepEqual(withZero.finalOrder, ["b", "a"]);
  assert.deepEqual(withUndefined.finalOrder, ["b", "a"]);
});

test("threshold sends totalInventory <= N to the bottom, ordered by inventory desc", () => {
  const products = [
    { id: "sweater-hill", title: "SWEATER HILL", totalInventory: 1, productType: "vestimenta-sweaters" },
    { id: "jean-841", title: "JEAN 841", totalInventory: 1, productType: "vestimenta-jeans" },
    { id: "campera-river", title: "CAMPERA RIVER", totalInventory: 2, productType: "vestimenta-camperas" },
    { id: "pack-boxers", title: "PACK BOXERS", totalInventory: 2, productType: null },
    { id: "camiseta-derek", title: "CAMISETA DEREK", totalInventory: 3, productType: "vestimenta-poleras" },
  ];

  // Every type present is known here, so this exercises the threshold alone.
  const order = [...GROUP_ORDER, "vestimenta-camperas", UNCATEGORIZED];
  const { finalOrder } = sortCollection(products, order, 2);

  // CAMISETA DEREK has 3 > 2, stays in main; the other four (<=2) go to the bottom.
  assert.equal(finalOrder[0], "camiseta-derek");
  assert.deepEqual(finalOrder.slice(1), [
    "campera-river", // 2, ties with pack-boxers -> alphabetical title
    "pack-boxers", // 2
    "jean-841", // 1, ties with sweater-hill -> alphabetical title
    "sweater-hill", // 1
  ]);
});

test("a threshold covering every product sends everything to the bottom, ordered by inventory desc", () => {
  const products = baseProducts();
  const { finalOrder } = sortCollection(products, GROUP_ORDER, 1000);
  const sortedByInventoryThenTitle = [...products]
    .sort((a, b) => b.totalInventory - a.totalInventory || a.title.localeCompare(b.title))
    .map((p) => p.id);
  assert.deepEqual(finalOrder, sortedByInventoryThenTitle);
});

test("null/empty productType falls into the (sin categoría) group", () => {
  const products = [
    { id: "a", title: "A", totalInventory: 10, productType: null },
    { id: "b", title: "B", totalInventory: 5, productType: "" },
    { id: "c", title: "C", totalInventory: 20, productType: "x" },
  ];
  const { finalOrder, newGroups } = sortCollection(products, [UNCATEGORIZED, "x"], 0);
  assert.deepEqual(finalOrder, ["a", "b", "c"]);
  assert.deepEqual(newGroups, []);
});

test("a productType not present in productTypeOrder goes to the very bottom (R7.3)", () => {
  const products = [
    { id: "jean", title: "JEAN", totalInventory: 10, productType: "vestimenta-jeans" },
    { id: "campera", title: "CAMPERA", totalInventory: 50, productType: "vestimenta-camperas" },
  ];
  const { finalOrder, newGroups } = sortCollection(products, ["vestimenta-jeans"], 0);
  // campera has way more stock but its group is unknown, so it still goes last.
  assert.deepEqual(finalOrder, ["jean", "campera"]);
  assert.deepEqual(newGroups, ["vestimenta-camperas"]);
});

test("new productTypes go below even the low-stock bucket, and the threshold doesn't split them", () => {
  const products = [
    { id: "known-high", title: "KNOWN HIGH", totalInventory: 50, productType: "known" },
    { id: "known-low", title: "KNOWN LOW", totalInventory: 1, productType: "known" },
    { id: "new-high", title: "NEW HIGH", totalInventory: 99, productType: "brand-new" },
    { id: "new-low", title: "NEW LOW", totalInventory: 1, productType: "brand-new" },
  ];
  const { finalOrder, newGroups } = sortCollection(products, ["known"], 2);
  // The whole pending category stays together at the very bottom: its own
  // low-stock products don't jump above it into the threshold bucket.
  assert.deepEqual(finalOrder, ["known-high", "known-low", "new-high", "new-low"]);
  assert.deepEqual(newGroups, ["brand-new"]);
});

test("multiple new productTypes are ordered alphabetically among themselves", () => {
  const products = [
    { id: "z", title: "Z", totalInventory: 10, productType: "zzz-new" },
    { id: "a", title: "A", totalInventory: 10, productType: "aaa-new" },
    { id: "known", title: "KNOWN", totalInventory: 10, productType: "known" },
  ];
  const { finalOrder, newGroups } = sortCollection(products, ["known"], 0);
  assert.deepEqual(finalOrder, ["known", "a", "z"]);
  assert.deepEqual(newGroups, ["aaa-new", "zzz-new"]);
});

test("negative/invalid threshold values are treated as no threshold", () => {
  const products = [
    { id: "a", title: "A", totalInventory: 0, productType: "x" },
    { id: "b", title: "B", totalInventory: 5, productType: "x" },
  ];
  const { finalOrder } = sortCollection(products, ["x"], -5);
  assert.deepEqual(finalOrder, ["b", "a"]);
});

// R12 — per-category manual product order (toggleable).
test("manual order (enabled) overrides stock-desc within that group only", () => {
  const products = [
    { id: "jean-351", title: "JEAN 351", totalInventory: 49, productType: "vestimenta-jeans" },
    { id: "jean-332", title: "JEAN 332", totalInventory: 5, productType: "vestimenta-jeans" },
    { id: "polera-c", title: "POLERA C", totalInventory: 15, productType: "vestimenta-poleras" },
    { id: "polera-a", title: "POLERA A", totalInventory: 1, productType: "vestimenta-poleras" },
  ];
  const manualProductOrder = {
    "vestimenta-jeans": { enabled: true, order: ["jean-332", "jean-351"] },
  };
  const { finalOrder } = sortCollection(products, ["vestimenta-jeans", "vestimenta-poleras"], 0, manualProductOrder);
  // jeans respect the dragged order even though it inverts stock; poleras
  // (no manual entry) still fall back to stock-desc.
  assert.deepEqual(finalOrder, ["jean-332", "jean-351", "polera-c", "polera-a"]);
});

test("manual order: products not yet positioned are appended, stock desc", () => {
  const products = [
    { id: "a", title: "A", totalInventory: 10, productType: "x" },
    { id: "b", title: "B", totalInventory: 30, productType: "x" },
    { id: "c", title: "C", totalInventory: 20, productType: "x" },
  ];
  // Only "a" was ever dragged into position; b/c showed up later (or were
  // never touched) and fall back to inventory desc, appended after it.
  const manualProductOrder = { x: { enabled: true, order: ["a"] } };
  const { finalOrder } = sortCollection(products, ["x"], 0, manualProductOrder);
  assert.deepEqual(finalOrder, ["a", "b", "c"]);
});

test("manual order (enabled) exempts the whole group from the stock threshold", () => {
  const products = [
    { id: "high", title: "HIGH", totalInventory: 50, productType: "x" },
    { id: "low", title: "LOW", totalInventory: 1, productType: "x" }, // would be <= threshold
  ];
  const manualProductOrder = { x: { enabled: true, order: ["low", "high"] } };
  const { finalOrder } = sortCollection(products, ["x"], 10, manualProductOrder);
  // Both stay together in the dragged order, not split by the threshold.
  assert.deepEqual(finalOrder, ["low", "high"]);
});

test("manual order entry with enabled:false is ignored (falls back to stock-desc and the threshold)", () => {
  const products = [
    { id: "high", title: "HIGH", totalInventory: 50, productType: "x" },
    { id: "low", title: "LOW", totalInventory: 1, productType: "x" },
  ];
  const manualProductOrder = { x: { enabled: false, order: ["low", "high"] } };
  const { finalOrder } = sortCollection(products, ["x"], 10, manualProductOrder);
  assert.deepEqual(finalOrder, ["high", "low"]);
});

test("isManualOrderEnabled reflects the enabled flag per group, including (sin categoría)", () => {
  const manualProductOrder = {
    x: { enabled: true, order: [] },
    y: { enabled: false, order: ["a"] },
  };
  assert.equal(isManualOrderEnabled(manualProductOrder, "x"), true);
  assert.equal(isManualOrderEnabled(manualProductOrder, "y"), false);
  assert.equal(isManualOrderEnabled(manualProductOrder, "z"), false);
  assert.equal(isManualOrderEnabled(manualProductOrder, null), false);
});
