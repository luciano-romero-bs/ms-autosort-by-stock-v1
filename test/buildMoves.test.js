import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoves, chunkMoves } from "../shared/buildMoves.mjs";

test("buildMoves assigns base-zero string positions in order", () => {
  const moves = buildMoves(["a", "b", "c"]);
  assert.deepEqual(moves, [
    { id: "a", newPosition: "0" },
    { id: "b", newPosition: "1" },
    { id: "c", newPosition: "2" },
  ]);
});

test("buildMoves on an empty list returns an empty array", () => {
  assert.deepEqual(buildMoves([]), []);
});

test("chunkMoves splits into batches of at most `size`", () => {
  const moves = Array.from({ length: 620 }, (_, i) => ({ id: String(i), newPosition: String(i) }));
  const chunks = chunkMoves(moves, 250);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].length, 250);
  assert.equal(chunks[1].length, 250);
  assert.equal(chunks[2].length, 120);
  assert.deepEqual(chunks.flat(), moves);
});

test("chunkMoves defaults to batches of 250", () => {
  const moves = Array.from({ length: 251 }, (_, i) => ({ id: String(i), newPosition: String(i) }));
  const chunks = chunkMoves(moves);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 250);
  assert.equal(chunks[1].length, 1);
});

test("chunkMoves on a list under the batch size returns a single chunk", () => {
  const moves = buildMoves(["a", "b"]);
  const chunks = chunkMoves(moves, 250);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0], moves);
});
