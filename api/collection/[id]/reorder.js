import { toCollectionGid } from "../../../lib/shopifyClient.js";
import { runReorder } from "../../../lib/reorderService.js";
import { requireBasicAuth } from "../../../lib/auth.js";

function isNumericId(value) {
  return /^\d+$/.test(value ?? "");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!requireBasicAuth(req, res)) return;

  const { id } = req.query;
  if (!isNumericId(id)) {
    return res.status(400).json({ ok: false, error: "Collection ID inválido: debe ser numérico." });
  }

  const { productTypeOrder, stockThreshold, save } = req.body || {};

  if (!Array.isArray(productTypeOrder) || !productTypeOrder.every((t) => typeof t === "string")) {
    return res.status(400).json({ ok: false, error: "productTypeOrder debe ser un array de strings." });
  }

  const threshold = stockThreshold ?? 0;
  if (!Number.isInteger(threshold) || threshold < 0) {
    return res.status(400).json({ ok: false, error: "stockThreshold debe ser un entero >= 0." });
  }

  const collectionGid = toCollectionGid(id);

  try {
    const result = await runReorder({
      collectionGid,
      productTypeOrder,
      stockThreshold: threshold,
      save: Boolean(save),
    });
    res.status(200).json({ ok: true, productsReordered: result.productsReordered });
  } catch (err) {
    if (err.code === "LOCKED") {
      return res.status(409).json({ ok: false, error: err.message });
    }
    if (err.code === "NOT_MANUAL") {
      return res.status(400).json({ ok: false, error: err.message });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
}
