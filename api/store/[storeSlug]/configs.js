import { listConfigs, getStoreBySlug } from "../../../lib/supabaseClient.js";
import { requireBasicAuth } from "../../../lib/auth.js";

// Lists the saved automations of one store, for the "Automatizaciones
// guardadas" section of the panel.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!requireBasicAuth(req, res)) return;

  try {
    const storeRow = await getStoreBySlug(req.query.storeSlug);
    if (!storeRow) {
      return res.status(404).json({ ok: false, error: `No existe la tienda "${req.query.storeSlug}".` });
    }

    const configs = await listConfigs(storeRow.id);
    res.status(200).json({ ok: true, configs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
