import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./env.js";

let client = null;

export function getSupabase() {
  if (!client) {
    const env = getEnv();
    client = createClient(env.supabaseUrl, env.supabaseServiceKey);
  }
  return client;
}

// Excludes admin_token — safe to return straight to the frontend.
const STORE_PUBLIC_COLUMNS = "id, slug, display_name, shop_domain, api_version, created_at";

export async function listStoresPublic() {
  const { data, error } = await getSupabase()
    .from("stores")
    .select(STORE_PUBLIC_COLUMNS)
    .order("display_name");
  if (error) throw new Error(`Supabase error (listStoresPublic): ${error.message}`);
  return data;
}

// Includes admin_token — only for backend code that talks to Shopify
// (the cron run, which needs every store's credentials at once).
export async function listStoresInternal() {
  const { data, error } = await getSupabase().from("stores").select("*");
  if (error) throw new Error(`Supabase error (listStoresInternal): ${error.message}`);
  return data;
}

// Includes admin_token — used per-request by the API routes to build the
// Shopify client for the store named in the URL.
export async function getStoreBySlug(slug) {
  const { data, error } = await getSupabase().from("stores").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Supabase error (getStoreBySlug): ${error.message}`);
  return data;
}

export async function upsertStore({ slug, displayName, shopDomain, adminToken, apiVersion }) {
  const { data, error } = await getSupabase()
    .from("stores")
    .upsert(
      {
        slug,
        display_name: displayName,
        shop_domain: shopDomain,
        admin_token: adminToken,
        api_version: apiVersion || "2025-10",
      },
      { onConflict: "slug" }
    )
    .select(STORE_PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Supabase error (upsertStore): ${error.message}`);
  return data;
}

export async function getConfig(storeId, collectionGid) {
  const { data, error } = await getSupabase()
    .from("collection_configs")
    .select("*")
    .eq("store_id", storeId)
    .eq("collection_gid", collectionGid)
    .maybeSingle();
  if (error) throw new Error(`Supabase error (getConfig): ${error.message}`);
  return data;
}

// storeId omitted -> every config across every store (used by the login
// ping in the frontend, which doesn't care about the contents).
export async function listConfigs(storeId) {
  let query = getSupabase().from("collection_configs").select("*");
  if (storeId) query = query.eq("store_id", storeId);
  const { data, error } = await query;
  if (error) throw new Error(`Supabase error (listConfigs): ${error.message}`);
  return data;
}

export async function listEnabledConfigs(storeId) {
  const { data, error } = await getSupabase()
    .from("collection_configs")
    .select("*")
    .eq("store_id", storeId)
    .eq("enabled", true);
  if (error) throw new Error(`Supabase error (listEnabledConfigs): ${error.message}`);
  return data;
}

export async function upsertConfig({
  storeId,
  collectionGid,
  collectionTitle,
  productTypeOrder,
  stockThreshold,
  enabled,
}) {
  const { data, error } = await getSupabase()
    .from("collection_configs")
    .upsert(
      {
        store_id: storeId,
        collection_gid: collectionGid,
        collection_title: collectionTitle,
        product_type_order: productTypeOrder,
        stock_threshold: stockThreshold,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "store_id,collection_gid" }
    )
    .select()
    .maybeSingle();
  if (error) throw new Error(`Supabase error (upsertConfig): ${error.message}`);
  return data;
}

export async function writeRunLog({ storeId, collectionGid, status, productsCount, message }) {
  const { error } = await getSupabase().from("run_logs").insert({
    store_id: storeId,
    collection_gid: collectionGid,
    status,
    products_count: productsCount ?? null,
    message: message ?? null,
    ran_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Supabase error (writeRunLog): ${error.message}`);
}
