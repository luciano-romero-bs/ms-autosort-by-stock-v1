import { sortCollection } from "../shared/sortCollection.mjs";
import { buildMoves, chunkMoves } from "../shared/buildMoves.mjs";
import { getCollectionProducts, reorderCollection } from "./shopifyClient.js";
import { withLock } from "./lock.js";
import { upsertConfig, listEnabledConfigs, writeRunLog } from "./supabaseClient.js";

/**
 * Fetches fresh data from Shopify, runs the pure sort algorithm, executes the
 * reorder mutation (batched + polled), and optionally persists the config.
 * Shared by POST /api/collection/:id/reorder and /api/cron/run so the logic
 * lives in exactly one place.
 */
export async function runReorder({
  collectionGid,
  productTypeOrder,
  stockThreshold,
  save,
}) {
  return withLock(collectionGid, async () => {
    const { title, isManual, products } = await getCollectionProducts(collectionGid);

    if (!isManual) {
      const err = new Error(
        `La colección "${title}" no está en sortOrder MANUAL. Cambiala en el admin de Shopify antes de reordenar.`
      );
      err.code = "NOT_MANUAL";
      throw err;
    }

    const { finalOrder, newGroups } = sortCollection(products, productTypeOrder, stockThreshold);
    const batches = chunkMoves(buildMoves(finalOrder), 250);
    await reorderCollection(collectionGid, batches);

    if (save) {
      await upsertConfig({
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
 * Runs the daily reorder for every enabled config, reusing runReorder.
 * Never throws: failures are captured per-collection so one bad collection
 * doesn't stop the rest (R7.4).
 */
export async function runCronForAllEnabled() {
  const configs = await listEnabledConfigs();
  const summary = { processed: 0, success: 0, errors: 0, skipped: 0 };

  for (const config of configs) {
    summary.processed += 1;
    try {
      const result = await runReorder({
        collectionGid: config.collection_gid,
        productTypeOrder: config.product_type_order || [],
        stockThreshold: config.stock_threshold || 0,
        save: false,
      });

      const message = result.newGroups.length
        ? `productType nuevo sin posición asignada, ubicado al final: ${result.newGroups.join(", ")}`
        : null;
      if (message) console.warn(`[cron] ${config.collection_gid}: ${message}`);

      await writeRunLog({
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

      console.error(`[cron] ${config.collection_gid}: ${err.message}`);
      await writeRunLog({
        collectionGid: config.collection_gid,
        status,
        message: err.message,
      });
    }
  }

  return summary;
}
