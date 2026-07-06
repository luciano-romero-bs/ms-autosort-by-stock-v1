import { UNCATEGORIZED } from "../../../shared/sortCollection.mjs";
import { getCollectionProducts, toCollectionGid } from "../../../lib/shopifyClient.js";
import { requireBasicAuth } from "../../../lib/auth.js";

function isNumericId(value) {
  return /^\d+$/.test(value ?? "");
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!requireBasicAuth(req, res)) return;

  const { id } = req.query;
  if (!isNumericId(id)) {
    return res.status(400).json({ ok: false, error: "Collection ID inválido: debe ser numérico." });
  }

  const collectionGid = toCollectionGid(id);

  try {
    const { title, sortOrder, isManual, products } = await getCollectionProducts(collectionGid);
    const productTypes = [...new Set(products.map((p) => p.productType?.trim() || UNCATEGORIZED))];

    res.status(200).json({
      collectionTitle: title,
      sortOrder,
      isManual,
      products,
      productTypes,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
}
