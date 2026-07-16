import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCatDetailsTheme,
  CAT_DETAILS_THEME_STORAGE_KEY,
  DEFAULT_CAT_DETAILS_THEME,
  loadCatDetailsTheme,
  normalizeCatDetailsTheme,
  saveCatDetailsTheme
} from "../src/js/cat-details-theme.js";

test("detail-card themes normalize unknown values to the default", () => {
  assert.equal(DEFAULT_CAT_DETAILS_THEME, "template-card");
  assert.equal(normalizeCatDetailsTheme("rare-card"), "rare-card");
  assert.equal(normalizeCatDetailsTheme("classic-pepe"), "classic-pepe");
  assert.equal(normalizeCatDetailsTheme("template-card"), "template-card");
  assert.equal(normalizeCatDetailsTheme("unknown"), DEFAULT_CAT_DETAILS_THEME);
  assert.equal(normalizeCatDetailsTheme(null), DEFAULT_CAT_DETAILS_THEME);
});

test("detail-card themes load and save safely through storage", () => {
  const stored = new Map([[CAT_DETAILS_THEME_STORAGE_KEY, "classic-pepe"]]);
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value)
  };
  assert.equal(loadCatDetailsTheme(storage), "classic-pepe");
  stored.set(CAT_DETAILS_THEME_STORAGE_KEY, "unknown");
  assert.equal(loadCatDetailsTheme(storage), DEFAULT_CAT_DETAILS_THEME);
  stored.set(CAT_DETAILS_THEME_STORAGE_KEY, "classic-pepe");
  assert.equal(saveCatDetailsTheme(storage, "unknown"), DEFAULT_CAT_DETAILS_THEME);
  assert.equal(stored.get(CAT_DETAILS_THEME_STORAGE_KEY), DEFAULT_CAT_DETAILS_THEME);
  assert.equal(saveCatDetailsTheme(storage, "template-card"), "template-card");
  assert.equal(loadCatDetailsTheme(storage), "template-card");
  assert.equal(loadCatDetailsTheme({ getItem: () => { throw new Error("blocked"); } }), DEFAULT_CAT_DETAILS_THEME);
  assert.equal(saveCatDetailsTheme({ setItem: () => { throw new Error("blocked"); } }, "classic-pepe"), "classic-pepe");
});

test("detail-card themes apply normalized values to card markup", () => {
  const card = { dataset: {} };
  assert.equal(applyCatDetailsTheme(card, "rare-card"), "rare-card");
  assert.equal(card.dataset.theme, "rare-card");
  assert.equal(applyCatDetailsTheme(card, "unknown"), DEFAULT_CAT_DETAILS_THEME);
  assert.equal(card.dataset.theme, DEFAULT_CAT_DETAILS_THEME);
});
