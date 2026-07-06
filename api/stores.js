import { listStoresPublic, upsertStore } from "../lib/supabaseClient.js";
import { requireBasicAuth } from "../lib/auth.js";

// Same slug shape used in the /api/store/:storeSlug/... URLs — lowercase,
// digits and single hyphens only, so it's always URL-safe with no encoding.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export default async function handler(req, res) {
  if (!requireBasicAuth(req, res)) return;

  if (req.method === "GET") {
    try {
      const stores = await listStoresPublic();
      return res.status(200).json({ ok: true, stores });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method === "POST") {
    const { slug, displayName, shopDomain, adminToken, apiVersion } = req.body || {};

    if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
      return res
        .status(400)
        .json({ ok: false, error: "slug inválido: solo minúsculas, números y guiones (ej. jack-jones-dev)." });
    }
    if (typeof displayName !== "string" || !displayName.trim()) {
      return res.status(400).json({ ok: false, error: "displayName es obligatorio." });
    }
    if (typeof shopDomain !== "string" || !shopDomain.endsWith(".myshopify.com")) {
      return res.status(400).json({ ok: false, error: "shopDomain debe terminar en .myshopify.com" });
    }
    if (typeof adminToken !== "string" || !adminToken.trim()) {
      return res.status(400).json({ ok: false, error: "adminToken es obligatorio." });
    }

    try {
      const store = await upsertStore({ slug, displayName, shopDomain, adminToken, apiVersion });
      return res.status(200).json({ ok: true, store });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}
