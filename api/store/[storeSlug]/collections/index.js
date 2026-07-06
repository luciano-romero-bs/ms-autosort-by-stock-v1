import { listCollections } from "../../../../lib/shopifyClient.js";
import { getStoreBySlug, listStoreCollections, replaceStoreCollections } from "../../../../lib/supabaseClient.js";
import { requireBasicAuth } from "../../../../lib/auth.js";

// GET: returns the cached collection list of the store (last sync).
// POST: re-syncs from Shopify on demand ("Refrescar colecciones") and
// returns the fresh list. The panel crosses this against the saved
// automations to show which collections aren't automated yet.
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!requireBasicAuth(req, res)) return;

  try {
    const storeRow = await getStoreBySlug(req.query.storeSlug);
    if (!storeRow) {
      return res.status(404).json({ ok: false, error: `No existe la tienda "${req.query.storeSlug}".` });
    }

    if (req.method === "POST") {
      const store = {
        shopDomain: storeRow.shop_domain,
        adminToken: storeRow.admin_token,
        apiVersion: storeRow.api_version,
      };
      const fresh = await listCollections(store);
      await replaceStoreCollections(storeRow.id, fresh);
    }

    const collections = await listStoreCollections(storeRow.id);
    res.status(200).json({ ok: true, collections });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
