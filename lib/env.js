function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Lazy on purpose: reading env vars at call time (not at module load) keeps
// this importable from unit tests that never touch Shopify/Supabase, and
// works whether the vars come from Vercel's runtime env or a local .env.local
// loaded by `vercel dev`.
export function getEnv() {
  return {
    shopifyShop: required("SHOPIFY_SHOP"),
    shopifyAdminToken: required("SHOPIFY_ADMIN_TOKEN"),
    shopifyApiVersion: process.env.SHOPIFY_API_VERSION || "2025-10",
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceKey: required("SUPABASE_SERVICE_KEY"),
    cronSecret: required("CRON_SECRET"),
    panelUser: required("PANEL_USER"),
    panelPass: required("PANEL_PASS"),
  };
}
