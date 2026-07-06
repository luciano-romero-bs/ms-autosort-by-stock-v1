import { listConfigs } from "../lib/supabaseClient.js";
import { requireBasicAuth } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!requireBasicAuth(req, res)) return;

  try {
    const configs = await listConfigs();
    res.status(200).json({ ok: true, configs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
