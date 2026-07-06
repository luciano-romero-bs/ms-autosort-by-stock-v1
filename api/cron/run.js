import { runCronForAllEnabled } from "../../lib/reorderService.js";
import { requireCronAuth } from "../../lib/auth.js";

// Triggered daily by the Vercel Cron Job declared in vercel.json (GET), and
// also usable by hand via curl with X-Cron-Secret while testing (POST or GET).
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!requireCronAuth(req, res)) return;

  try {
    const summary = await runCronForAllEnabled();
    res.status(200).json(summary);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
