const UNCATEGORIZED = "(sin categoría)";

function groupKey(productType) {
  return productType && productType.trim() !== "" ? productType : UNCATEGORIZED;
}

function byInventoryDescThenTitle(a, b) {
  if (b.totalInventory !== a.totalInventory) return b.totalInventory - a.totalInventory;
  return a.title.localeCompare(b.title);
}

function normalizeThreshold(stockThreshold) {
  return Number.isFinite(stockThreshold) && stockThreshold > 0 ? stockThreshold : 0;
}

/**
 * Whether a product falls to the bottom bucket for a given threshold.
 * Exported so the frontend preview can tag "fondo" items with the exact
 * same rule sortCollection uses internally (R4.2).
 */
export function isBelowThreshold(product, stockThreshold) {
  const threshold = normalizeThreshold(stockThreshold);
  return threshold > 0 && product.totalInventory <= threshold;
}

/**
 * Pure sorting algorithm — no I/O. Shared between backend and frontend preview.
 * Returns { finalOrder: string[], newGroups: string[] } where newGroups lists
 * groupKeys present in the products but absent from productTypeOrder.
 *
 * Final layout, top to bottom:
 *   1. known groups in productTypeOrder, inventory desc within each
 *   2. low-stock bucket (totalInventory <= threshold), inventory desc
 *   3. NEW groups (not in productTypeOrder) at the very bottom, whole —
 *      the threshold doesn't split them, since the entire category is
 *      pending user review (they carry a "Nueva" badge in the panel until
 *      the user positions them). Alphabetical between new groups.
 */
export function sortCollection(products, productTypeOrder = [], stockThreshold = 0) {
  const knownOrder = productTypeOrder.length ? productTypeOrder : [];
  const knownIndex = new Map(knownOrder.map((t, i) => [t, i]));

  const known = [];
  const unknown = [];
  for (const p of products) {
    if (knownIndex.has(groupKey(p.productType))) known.push(p);
    else unknown.push(p);
  }

  const bottom = [];
  const main = [];
  for (const p of known) {
    if (isBelowThreshold(p, stockThreshold)) bottom.push(p);
    else main.push(p);
  }

  const groups = new Map();
  for (const p of main) {
    const key = groupKey(p.productType);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const orderedGroupKeys = [...groups.keys()].sort((a, b) => knownIndex.get(a) - knownIndex.get(b));

  const mainOrdered = [];
  for (const key of orderedGroupKeys) {
    const groupProducts = groups.get(key).slice().sort(byInventoryDescThenTitle);
    mainOrdered.push(...groupProducts);
  }

  const bottomOrdered = bottom.slice().sort(byInventoryDescThenTitle);

  const newGroupsMap = new Map();
  for (const p of unknown) {
    const key = groupKey(p.productType);
    if (!newGroupsMap.has(key)) newGroupsMap.set(key, []);
    newGroupsMap.get(key).push(p);
  }
  const newGroupKeys = [...newGroupsMap.keys()].sort((a, b) => a.localeCompare(b));

  const newOrdered = [];
  for (const key of newGroupKeys) {
    const groupProducts = newGroupsMap.get(key).slice().sort(byInventoryDescThenTitle);
    newOrdered.push(...groupProducts);
  }

  const finalOrder = [...mainOrdered, ...bottomOrdered, ...newOrdered].map((p) => p.id);

  return { finalOrder, newGroups: newGroupKeys };
}

export { UNCATEGORIZED };
