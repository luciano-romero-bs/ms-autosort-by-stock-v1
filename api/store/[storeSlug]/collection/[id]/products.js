import { UNCATEGORIZED } from "../../../../../shared/sortCollection.mjs";
import { getCollectionProducts, toCollectionGid } from "../../../../../lib/shopifyClient.js";
import { getStoreBySlug } from "../../../../../lib/supabaseClient.js";
import { requireBasicAuth } from "../../../../../lib/auth.js";

function isNumericId(value) {
  return /^\d+$/.test(value ?? "");
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!requireBasicAuth(req, res)) return;

  const { storeSlug, id } = req.query;
  if (!isNumericId(id)) {
    return res.status(400).json({ ok: false, error: "Collection ID inválido: debe ser numérico." });
  }

  try {
    const storeRow = await getStoreBySlug(storeSlug);
    if (!storeRow) return res.status(404).json({ ok: false, error: `No existe la tienda "${storeSlug}".` });
    const store = {
      shopDomain: storeRow.shop_domain,
      adminToken: storeRow.admin_token,
      apiVersion: storeRow.api_version,
    };

    const collectionGid = toCollectionGid(id);
    const { title, sortOrder, isManual, products } = await getCollectionProducts(collectionGid, store);
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
