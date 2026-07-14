import test from "node:test";
import assert from "node:assert/strict";

import {
  ATLAS_H,
  ATLAS_W,
  COLS,
  FILTER_DEFINITIONS,
  FILTER_KEYS,
  MAX_ID,
  PHI,
  RHOMBUS_CAT_COUNT,
  ROWS,
  TILE_H,
  TILE_W,
  TRI_FACE_COUNT,
  TRI_FACE_TEX_H,
  TRI_FACE_TEX_W,
  filterTextureUrl,
  triFaceTextureUrl
} from "../src/js/config.js";

test("atlas and CatMoon grid constants are internally consistent", () => {
  assert.equal(ATLAS_W, COLS * TILE_W);
  assert.equal(ATLAS_H, ROWS * TILE_H);
  assert.equal(MAX_ID, COLS * ROWS - 1);
  assert.equal(TRI_FACE_COUNT * RHOMBUS_CAT_COUNT, MAX_ID + 1);
});

test("tri-face texture dimensions are derived from the golden ratio", () => {
  assert.equal(TRI_FACE_TEX_W, 1536);
  assert.equal(TRI_FACE_TEX_H, Math.round(TRI_FACE_TEX_W * PHI));
});

test("filter registry exposes every configured filter key", () => {
  assert.ok(FILTER_DEFINITIONS.length > 0);
  for (const definition of FILTER_DEFINITIONS) {
    assert.ok(FILTER_KEYS.has(definition.key), `missing filter key ${definition.key}`);
  }
});

test("texture URL helpers use zero-padded tri-face filenames", () => {
  assert.equal(triFaceTextureUrl(0), "/img/tri-faces/tri-face-00.png");
  assert.equal(triFaceTextureUrl(9), "/img/tri-faces/tri-face-09.png");
  assert.equal(triFaceTextureUrl(12), "/img/tri-faces/tri-face-12.png");
  assert.equal(filterTextureUrl("genesis", 3), "/img/filters/genesis/tri-face-03.png");
});
