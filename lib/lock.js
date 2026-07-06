import { getSupabase } from "./supabaseClient.js";

// Serverless functions don't share memory across invocations (and can run
// concurrently on separate instances), so unlike a single always-on process
// this lock has to live in Supabase, not in a process-local Set (R5.5).
const STALE_MS = 5 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";

/**
 * Runs fn() while holding a per-collection lock row in `collection_locks`.
 * Throws a LOCKED error (without running fn) if another reorder for the same
 * collection is already in flight.
 */
export async function withLock(collectionGid, fn) {
  const supabase = getSupabase();

  // Clean up locks left behind by a function that crashed/timed out mid-run,
  // so a bad invocation can't block this collection forever.
  await supabase
    .from("collection_locks")
    .delete()
    .eq("collection_gid", collectionGid)
    .lt("locked_at", new Date(Date.now() - STALE_MS).toISOString());

  const { error: insertError } = await supabase
    .from("collection_locks")
    .insert({ collection_gid: collectionGid, locked_at: new Date().toISOString() });

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      const err = new Error(`Ya hay un reordenamiento en curso para ${collectionGid}.`);
      err.code = "LOCKED";
      throw err;
    }
    throw new Error(`Supabase error (lock): ${insertError.message}`);
  }

  try {
    return await fn();
  } finally {
    await supabase.from("collection_locks").delete().eq("collection_gid", collectionGid);
  }
}
