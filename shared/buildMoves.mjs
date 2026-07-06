/**
 * Turns an ordered array of product IDs into Shopify collectionReorderProducts
 * moves: [{ id, newPosition }], newPosition as base-zero string.
 */
export function buildMoves(finalOrder) {
  return finalOrder.map((id, index) => ({ id, newPosition: String(index) }));
}

/**
 * Splits moves into batches of at most `size` (Shopify caps at 250 per request).
 */
export function chunkMoves(moves, size = 250) {
  const chunks = [];
  for (let i = 0; i < moves.length; i += size) {
    chunks.push(moves.slice(i, i + size));
  }
  return chunks;
}
