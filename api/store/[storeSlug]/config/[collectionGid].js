import { getConfig, upsertConfig, deleteConfig, getStoreBySlug } from "../../../../lib/supabaseClient.js";
import { requireBasicAuth } from "../../../../lib/auth.js";

function isStringArray(value) {
  return Array.isArray(value) && value.every((t) => typeof t === "string");
}

// GET: read one saved config. PUT: create/update an automation (used by the
// "Automatizar ordenado" button, the automation editor, and dismissing a
// "Nueva" flag). DELETE: remove the automation.
export default async function handler(req, res) {
  if (!["GET", "PUT", "DELETE"].includes(req.method)) {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!requireBasicAuth(req, res)) return;

  try {
    const storeRow = await getStoreBySlug(req.query.storeSlug);
    if (!storeRow) {
      return res.status(404).json({ ok: false, error: `No existe la tienda "${req.query.storeSlug}".` });
    }

    // Vercel already decodes %2F etc. in dynamic segments; the frontend must
    // encodeURIComponent the full gid (it contains slashes) when building the URL.
    const collectionGid = req.query.collectionGid;

    if (req.method === "GET") {
      const config = await getConfig(storeRow.id, collectionGid);
      if (!config) return res.status(404).json({ ok: false, error: "No hay config guardada para esa colección." });
      return res.status(200).json({ ok: true, config });
    }

    if (req.method === "PUT") {
      const { collectionTitle, productTypeOrder, stockThreshold, enabled, newProductTypes } = req.body || {};

      if (!isStringArray(productTypeOrder)) {
        return res.status(400).json({ ok: false, error: "productTypeOrder debe ser un array de strings." });
      }
      const threshold = stockThreshold ?? 0;
      if (!Number.isInteger(threshold) || threshold < 0) {
        return res.status(400).json({ ok: false, error: "stockThreshold debe ser un entero >= 0." });
      }
      if (newProductTypes !== undefined && !isStringArray(newProductTypes)) {
        return res.status(400).json({ ok: false, error: "newProductTypes debe ser un array de strings." });
      }

      const config = await upsertConfig({
        storeId: storeRow.id,
        collectionGid,
        collectionTitle: typeof collectionTitle === "string" ? collectionTitle : null,
        productTypeOrder,
        stockThreshold: threshold,
        enabled: enabled === undefined ? true : Boolean(enabled),
        newProductTypes,
      });
      return res.status(200).json({ ok: true, config });
    }

    // DELETE
    await deleteConfig(storeRow.id, collectionGid);
    return res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
