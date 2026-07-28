import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  CHARACTER_CATEGORY_KEYS,
  FILTER_DEFINITIONS,
  PRELOAD_FILTER_KEYS,
  SET_ONLY_FILTER_KEYS
} from "../src/js/config.js";
import { createFilterManager } from "../src/js/filters.js";

const filterData = JSON.parse(
  await readFile(new URL("../public/data/mooncat-filters.json", import.meta.url), "utf8")
);

function characterUnion(data) {
  return new Set(
    CHARACTER_CATEGORY_KEYS.flatMap((key) => data.categories[key].ids)
  );
}

function jsonResponse(value) {
  return {
    ok: true,
    async json() {
      return value;
    }
  };
}

test("Character Cats uses the runtime set-only overlay path", () => {
  const definition = FILTER_DEFINITIONS.find(({ key }) => key === "characters");

  assert.equal(definition?.setOnly, true);
  assert.equal(SET_ONLY_FILTER_KEYS.has("characters"), true);
  assert.equal(PRELOAD_FILTER_KEYS.includes("characters"), false);
});

test("Character Cats membership is the subtype union and its count matches that set", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/data/mooncat-filters.json")) {
      return jsonResponse(filterData);
    }
    if (String(url).endsWith("/data/mooncat-names.json")) {
      return jsonResponse({});
    }
    throw new Error(`Unexpected test fetch: ${url}`);
  };

  try {
    const manager = createFilterManager({
      textureLoader: { load() { throw new Error("prepared textures should not load"); } },
      applyTextureSettings(texture) {
        return texture;
      }
    });
    const filterSets = await manager.ensureFilterDataLoaded();
    const filterCounts = await manager.ensureFilterCountsLoaded();
    const expectedIds = characterUnion(filterData);

    assert.deepEqual([...filterSets.characters].sort((a, b) => a - b), [...expectedIds].sort((a, b) => a - b));
    assert.equal(filterCounts.characters, expectedIds.size);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Genesis and aggregate Character Cats have no overlapping IDs", () => {
  const genesisIds = new Set(filterData.categories.genesis.ids);
  const characterIds = characterUnion(filterData);
  const overlap = [...genesisIds].filter((id) => characterIds.has(id));

  assert.deepEqual(overlap, []);
});
