import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./env.js";
import { DEFAULT_API_VERSION } from "./apiVersion.js";

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
        api_version: apiVersion || DEFAULT_API_VERSION,
      },
      { onConflict: "slug" }
    )
    .select(STORE_PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Supabase error (upsertStore): ${error.message}`);
  return data;
}

// Edits an existing store. The slug is immutable (it's the identifier used
// in every /api/store/:storeSlug/... URL); adminToken is optional here so
// the edit form can be submitted without retyping a token that was never
// sent back to the frontend in the first place.
export async function updateStore(slug, { displayName, shopDomain, adminToken, apiVersion }) {
  const row = {
    display_name: displayName,
    shop_domain: shopDomain,
    api_version: apiVersion || DEFAULT_API_VERSION,
  };
  if (adminToken) row.admin_token = adminToken;

  const { data, error } = await getSupabase()
    .from("stores")
    .update(row)
    .eq("slug", slug)
    .select(STORE_PUBLIC_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Supabase error (updateStore): ${error.message}`);
  return data;
}

// Deletes a store. `collection_configs`, `run_logs`, `collection_locks` and
// `store_collections` all reference stores(id) with `on delete cascade`
// (migrations 0002/0004), so this also removes every automation, log,
// serialization lock and cached collection of that store in one go.
export async function deleteStore(slug) {
  const { error } = await getSupabase().from("stores").delete().eq("slug", slug);
  if (error) throw new Error(`Supabase error (deleteStore): ${error.message}`);
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
  newProductTypes,
}) {
  const row = {
    store_id: storeId,
    collection_gid: collectionGid,
    collection_title: collectionTitle,
    product_type_order: productTypeOrder,
    stock_threshold: stockThreshold,
    enabled,
    updated_at: new Date().toISOString(),
  };
  // Only touch new_product_types when the caller says so — an upsert that
  // omits the column leaves the existing flags (set by the cron) intact.
  if (newProductTypes !== undefined) row.new_product_types = newProductTypes;

  const { data, error } = await getSupabase()
    .from("collection_configs")
    .upsert(row, { onConflict: "store_id,collection_gid" })
    .select()
    .maybeSingle();
  if (error) throw new Error(`Supabase error (upsertConfig): ${error.message}`);
  return data;
}

export async function deleteConfig(storeId, collectionGid) {
  const { error } = await getSupabase()
    .from("collection_configs")
    .delete()
    .eq("store_id", storeId)
    .eq("collection_gid", collectionGid);
  if (error) throw new Error(`Supabase error (deleteConfig): ${error.message}`);
}

// Used by the cron to flag productTypes it found that aren't positioned yet.
export async function setNewProductTypes(storeId, collectionGid, types) {
  const { error } = await getSupabase()
    .from("collection_configs")
    .update({ new_product_types: types })
    .eq("store_id", storeId)
    .eq("collection_gid", collectionGid);
  if (error) throw new Error(`Supabase error (setNewProductTypes): ${error.message}`);
}

export async function listStoreCollections(storeId) {
  const { data, error } = await getSupabase()
    .from("store_collections")
    .select("*")
    .eq("store_id", storeId)
    .order("title");
  if (error) throw new Error(`Supabase error (listStoreCollections): ${error.message}`);
  return data;
}

/**
 * Replaces the cached collection list of a store with a fresh Shopify sync.
 * Upserts every fetched collection (preserving the `ignored` flag of rows
 * that already existed) and deletes the ones Shopify no longer returns.
 */
export async function replaceStoreCollections(storeId, collections) {
  const syncedAt = new Date().toISOString();

  if (collections.length) {
    const rows = collections.map((c) => ({
      store_id: storeId,
      collection_gid: c.id,
      title: c.title,
      sort_order: c.sortOrder,
      products_count: c.productsCount,
      synced_at: syncedAt,
    }));
    const { error } = await getSupabase()
      .from("store_collections")
      .upsert(rows, { onConflict: "store_id,collection_gid" });
    if (error) throw new Error(`Supabase error (replaceStoreCollections): ${error.message}`);
  }

  // Anything not touched by this sync no longer exists in Shopify.
  const { error: deleteError } = await getSupabase()
    .from("store_collections")
    .delete()
    .eq("store_id", storeId)
    .lt("synced_at", syncedAt);
  if (deleteError) throw new Error(`Supabase error (replaceStoreCollections/prune): ${deleteError.message}`);
}

export async function setCollectionIgnored(storeId, collectionGid, ignored) {
  const { error } = await getSupabase()
    .from("store_collections")
    .update({ ignored })
    .eq("store_id", storeId)
    .eq("collection_gid", collectionGid);
  if (error) throw new Error(`Supabase error (setCollectionIgnored): ${error.message}`);
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
