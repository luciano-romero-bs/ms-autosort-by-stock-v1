import { sortCollection } from "../shared/sortCollection.mjs";
import { buildMoves, chunkMoves } from "../shared/buildMoves.mjs";
import { getCollectionProducts, reorderCollection } from "./shopifyClient.js";
import { withLock } from "./lock.js";
import {
  upsertConfig,
  listStoresInternal,
  listEnabledConfigs,
  writeRunLog,
  setNewProductTypes,
} from "./supabaseClient.js";

/**
 * Fetches fresh data from Shopify, runs the pure sort algorithm, executes the
 * reorder mutation (batched + polled), and optionally persists the config.
 * Shared by POST /api/store/:storeSlug/collection/:id/reorder and the cron
 * run so the logic lives in exactly one place. `store` must include `id`
 * (for Supabase scoping) plus shopDomain/adminToken/apiVersion (for Shopify).
 */
export async function runReorder({ store, collectionGid, productTypeOrder, stockThreshold, save }) {
  return withLock(store.id, collectionGid, async () => {
    const { title, isManual, products } = await getCollectionProducts(collectionGid, store);

    if (!isManual) {
      const err = new Error(
        `La colección "${title}" no está en sortOrder MANUAL. Cambiala en el admin de Shopify antes de reordenar.`
      );
      err.code = "NOT_MANUAL";
      throw err;
    }

    const { finalOrder, newGroups } = sortCollection(products, productTypeOrder, stockThreshold);
    const batches = chunkMoves(buildMoves(finalOrder), 250);
    await reorderCollection(collectionGid, batches, store);

    if (save) {
      await upsertConfig({
        storeId: store.id,
        collectionGid,
        collectionTitle: title,
        productTypeOrder,
        stockThreshold,
        enabled: true,
      });
    }

    return {
      collectionTitle: title,
      productsReordered: finalOrder.length,
      newGroups,
    };
  });
}

/**
 * Runs the daily reorder for every enabled config, across every store,
 * reusing runReorder. Never throws: failures are captured per-collection so
 * one bad collection (or one bad store) doesn't stop the rest (R7.4).
 */
export async function runCronForAllEnabled() {
  const stores = await listStoresInternal();
  const summary = { processed: 0, success: 0, errors: 0, skipped: 0 };

  for (const storeRow of stores) {
    const store = {
      id: storeRow.id,
      slug: storeRow.slug,
      shopDomain: storeRow.shop_domain,
      adminToken: storeRow.admin_token,
      apiVersion: storeRow.api_version,
    };
    const configs = await listEnabledConfigs(store.id);

    for (const config of configs) {
      summary.processed += 1;
      try {
        const result = await runReorder({
          store,
          collectionGid: config.collection_gid,
          productTypeOrder: config.product_type_order || [],
          stockThreshold: config.stock_threshold || 0,
          save: false,
        });

        const message = result.newGroups.length
          ? `productType nuevo sin posición asignada, ubicado al final: ${result.newGroups.join(", ")}`
          : null;
        if (message) console.warn(`[cron] ${store.slug}/${config.collection_gid}: ${message}`);

        // Flag the unpositioned types so the panel shows the "Nueva" badge
        // and the user gets notified next time they open it (R10.3).
        if (result.newGroups.length) {
          const already = config.new_product_types || [];
          const merged = [...new Set([...already, ...result.newGroups])];
          if (merged.length !== already.length) {
            await setNewProductTypes(store.id, config.collection_gid, merged);
          }
        }

        await writeRunLog({
          storeId: store.id,
          collectionGid: config.collection_gid,
          status: "success",
          productsCount: result.productsReordered,
          message,
        });
        summary.success += 1;
      } catch (err) {
        const status = err.code === "NOT_MANUAL" ? "skipped" : "error";
        if (status === "skipped") summary.skipped += 1;
        else summary.errors += 1;

        console.error(`[cron] ${store.slug}/${config.collection_gid}: ${err.message}`);
        await writeRunLog({
          storeId: store.id,
          collectionGid: config.collection_gid,
          status,
          message: err.message,
        });
      }
    }
  }

  return summary;
}
