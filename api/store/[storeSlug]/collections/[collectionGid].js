import { getStoreBySlug, setCollectionIgnored } from "../../../../lib/supabaseClient.js";
import { requireBasicAuth } from "../../../../lib/auth.js";

// PATCH { ignored: boolean }: hides a collection from (or restores it to)
// the "Colecciones sin automatizar" list, without creating an automation.
export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!requireBasicAuth(req, res)) return;

  const { ignored } = req.body || {};
  if (typeof ignored !== "boolean") {
    return res.status(400).json({ ok: false, error: "ignored debe ser un boolean." });
  }

  try {
    const storeRow = await getStoreBySlug(req.query.storeSlug);
    if (!storeRow) {
      return res.status(404).json({ ok: false, error: `No existe la tienda "${req.query.storeSlug}".` });
    }

    await setCollectionIgnored(storeRow.id, req.query.collectionGid, ignored);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
