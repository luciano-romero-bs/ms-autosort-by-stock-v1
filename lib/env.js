function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Lazy on purpose: reading env vars at call time (not at module load) keeps
// this importable from unit tests that never touch Supabase, and works
// whether the vars come from Vercel's runtime env or a local .env.local
// loaded by `vercel dev`. Per-store Shopify credentials (domain + admin
// token) are NOT here — they live in the `stores` table in Supabase, since
// this app manages multiple stores dynamically (see lib/supabaseClient.js).
export function getEnv() {
  return {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceKey: required("SUPABASE_SERVICE_KEY"),
    cronSecret: required("CRON_SECRET"),
    panelUser: required("PANEL_USER"),
    panelPass: required("PANEL_PASS"),
  };
}
