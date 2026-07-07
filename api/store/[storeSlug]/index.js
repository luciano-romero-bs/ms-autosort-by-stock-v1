import { getStoreBySlug, updateStore, deleteStore } from "../../../lib/supabaseClient.js";
import { requireBasicAuth } from "../../../lib/auth.js";

// PUT: edit an existing store's display name / domain / API version, and
// optionally rotate its admin token (left blank, the existing token is kept
// — see updateStore). DELETE: remove the store and everything scoped to it
// (automations, logs, locks, cached collections — all `on delete cascade`).
export default async function handler(req, res) {
  if (!["PUT", "DELETE"].includes(req.method)) {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!requireBasicAuth(req, res)) return;

  const { storeSlug } = req.query;

  try {
    const storeRow = await getStoreBySlug(storeSlug);
    if (!storeRow) {
      return res.status(404).json({ ok: false, error: `No existe la tienda "${storeSlug}".` });
    }

    if (req.method === "PUT") {
      const { displayName, shopDomain, adminToken, apiVersion } = req.body || {};

      if (typeof displayName !== "string" || !displayName.trim()) {
        return res.status(400).json({ ok: false, error: "displayName es obligatorio." });
      }
      if (typeof shopDomain !== "string" || !shopDomain.endsWith(".myshopify.com")) {
        return res.status(400).json({ ok: false, error: "shopDomain debe terminar en .myshopify.com" });
      }
      if (adminToken !== undefined && adminToken !== "" && typeof adminToken !== "string") {
        return res.status(400).json({ ok: false, error: "adminToken inválido." });
      }

      const store = await updateStore(storeSlug, { displayName, shopDomain, adminToken, apiVersion });
      return res.status(200).json({ ok: true, store });
    }

    // DELETE
    await deleteStore(storeSlug);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
