#!/usr/bin/env node
// Runs the same logic behind GET/POST /api/cron/run and Vercel's daily Cron
// Job, but directly with `node` — no HTTP, no Vercel — useful while
// developing locally before the project is connected to Vercel/Supabase-in-prod.
import { runCronForAllEnabled } from "../lib/reorderService.js";

try {
  const summary = await runCronForAllEnabled();
  console.log("[run-cron-locally] summary:", JSON.stringify(summary));
  process.exit(summary.errors > 0 ? 1 : 0);
} catch (err) {
  console.error("[run-cron-locally] fatal error:", err.message);
  process.exit(1);
}
