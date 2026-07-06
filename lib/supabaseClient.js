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

export async function getConfig(collectionGid) {
  const { data, error } = await getSupabase()
    .from("collection_configs")
    .select("*")
    .eq("collection_gid", collectionGid)
    .maybeSingle();
  if (error) throw new Error(`Supabase error (getConfig): ${error.message}`);
  return data;
}

export async function listConfigs() {
  const { data, error } = await getSupabase().from("collection_configs").select("*");
  if (error) throw new Error(`Supabase error (listConfigs): ${error.message}`);
  return data;
}

export async function listEnabledConfigs() {
  const { data, error } = await getSupabase()
    .from("collection_configs")
    .select("*")
    .eq("enabled", true);
  if (error) throw new Error(`Supabase error (listEnabledConfigs): ${error.message}`);
  return data;
}

export async function upsertConfig({
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
        collection_gid: collectionGid,
        collection_title: collectionTitle,
        product_type_order: productTypeOrder,
        stock_threshold: stockThreshold,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "collection_gid" }
    )
    .select()
    .maybeSingle();
  if (error) throw new Error(`Supabase error (upsertConfig): ${error.message}`);
  return data;
}

export async function writeRunLog({ collectionGid, status, productsCount, message }) {
  const { error } = await getSupabase().from("run_logs").insert({
    collection_gid: collectionGid,
    status,
    products_count: productsCount ?? null,
    message: message ?? null,
    ran_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Supabase error (writeRunLog): ${error.message}`);
}
