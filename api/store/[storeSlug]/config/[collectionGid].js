import { getConfig, getStoreBySlug } from "../../../../lib/supabaseClient.js";
import { requireBasicAuth } from "../../../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!requireBasicAuth(req, res)) return;

  try {
    const storeRow = await getStoreBySlug(req.query.storeSlug);
    if (!storeRow) {
      return res.status(404).json({ ok: false, error: `No existe la tienda "${req.query.storeSlug}".` });
    }

    // Vercel already decodes %2F etc. in dynamic segments; the frontend must
    // encodeURIComponent the full gid (it contains slashes) when building the URL.
    const config = await getConfig(storeRow.id, req.query.collectionGid);
    if (!config) return res.status(404).json({ ok: false, error: "No hay config guardada para esa colección." });
    res.status(200).json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
