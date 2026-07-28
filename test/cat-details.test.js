import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

import {
  classifyGenesisDetail,
  formatMoonCatClassifications,
  MOONCAT_DETAIL_FIELDS,
  createMoonCatDetailsLoader,
  getCatClickAction,
  moonCatDetailLinks,
  moonCatDetailLocation,
  validateMoonCatDetail,
  validateMoonCatDetailShard
} from "../src/js/cat-details.js";
import { createPointerActivationTracker } from "../src/js/controls.js";
import { MAX_ID, RHOMBUS_CAT_COUNT, TRI_FACE_COUNT } from "../src/js/config.js";

function makeDetail(rescueOrder) {
  return {
    rescueOrder,
    rescueYear: 2021,
    catId: `0x${String(rescueOrder).padStart(8, "0")}`,
    hueInt: 120,
    hueName: "green",
    pale: false,
    facing: "left",
    expression: "happy",
    pattern: "tabby",
    pose: "standing"
  };
}

function makeShard(faceIndex) {
  return Array.from({ length: RHOMBUS_CAT_COUNT }, (_, slotId) => makeDetail((faceIndex * RHOMBUS_CAT_COUNT) + slotId));
}

test("detail locations map rescue-order boundaries to zero-padded face shards", () => {
  assert.deepEqual(moonCatDetailLocation(0), {
    rescueOrder: 0,
    faceIndex: 0,
    slotId: 0,
    shardPath: "/data/mooncat-details/face-00.json"
  });
  assert.equal(moonCatDetailLocation(847).slotId, 847);
  assert.deepEqual(moonCatDetailLocation(848), {
    rescueOrder: 848,
    faceIndex: 1,
    slotId: 0,
    shardPath: "/data/mooncat-details/face-01.json"
  });
  assert.equal(moonCatDetailLocation(MAX_ID).shardPath, "/data/mooncat-details/face-29.json");
  assert.equal(moonCatDetailLocation(MAX_ID + 1), null);
});

test("detail links use the selected rescue order", () => {
  assert.deepEqual(moonCatDetailLinks(42), {
    chainStation: "https://mooncatrescue.com/mooncats/42",
    openSea: "https://opensea.io/item/ethereum/0xc3f733ca98e0dad0386979eb96fb1722a1a05e69/42"
  });
});

test("Genesis detail classification requires the source-backed sentinel pair", () => {
  assert.equal(classifyGenesisDetail({ hueInt: 1000, hueName: "black" }), "black");
  assert.equal(classifyGenesisDetail({ hueInt: 1000, hueName: "BLACK" }), "black");
  assert.equal(classifyGenesisDetail({ hueInt: 2000, hueName: "white" }), "white");
  assert.equal(classifyGenesisDetail({ hueInt: 2000, hueName: "White" }), "white");
  assert.equal(classifyGenesisDetail({ hueInt: 1000, hueName: "white" }), null);
  assert.equal(classifyGenesisDetail({ hueInt: 2000, hueName: "black" }), null);
  assert.equal(classifyGenesisDetail({ hueInt: 120, hueName: "green" }), null);
});

test("MoonCat classifications use inclusive early boundaries and mutually exclusive week one", () => {
  const classificationData = {
    week1Ids: new Set([0, 492, 903, 904, 1200]),
    characterCategorySets: new Map([
      ["zombie", new Set([491, 904])]
    ])
  };

  assert.equal(formatMoonCatClassifications(0, classificationData), "day 1");
  assert.equal(formatMoonCatClassifications(491, classificationData), "day 1, zombie");
  assert.equal(formatMoonCatClassifications(492, classificationData), "day 2");
  assert.equal(formatMoonCatClassifications(903, classificationData), "day 2");
  assert.equal(formatMoonCatClassifications(904, classificationData), "week 1, zombie");
  assert.equal(formatMoonCatClassifications(1200, classificationData), "week 1");
});

test("MoonCat classifications show one exact character subtype or no row value", () => {
  const classificationData = {
    week1Ids: new Set(),
    characterCategorySets: new Map([
      ["garfield", new Set([1000])],
      ["pikachu", new Set([1000, 1001])]
    ])
  };

  assert.equal(formatMoonCatClassifications(1000, classificationData), "garfield");
  assert.equal(formatMoonCatClassifications(1001, classificationData), "pikachu");
  assert.equal(formatMoonCatClassifications(1002, classificationData), null);
  assert.equal(formatMoonCatClassifications(-1, classificationData), null);
});

test("scene-cat click decisions pin, open, repin, and clear without HUD state", () => {
  assert.equal(getCatClickAction(null, 42), "pin");
  assert.equal(getCatClickAction(42, 42), "open");
  assert.equal(getCatClickAction(42, 43), "pin");
  assert.equal(getCatClickAction(42, null), "clear");
  assert.equal(getCatClickAction(null, null), "none");
});

test("pointer activation preserves ordinary repeated mouse and touch clicks through capture", () => {
  const tracker = createPointerActivationTracker();
  tracker.start({ pointerId: 1, pointerType: "mouse", clientX: 100, clientY: 200 });
  assert.deepEqual(tracker.consume({ pointerId: 1, pointerType: "mouse", clientX: 103, clientY: 204 }), { clientX: 103, clientY: 204 });

  tracker.start({ pointerId: 2, pointerType: "touch", clientX: 80, clientY: 90 });
  assert.deepEqual(tracker.consume({ pointerId: 2, pointerType: "touch", clientX: 80, clientY: 90 }), { clientX: 80, clientY: 90 });

  tracker.start({ pointerId: 3, pointerType: "mouse", clientX: 0, clientY: 0 });
  assert.equal(tracker.consume({ pointerId: 3, pointerType: "mouse", clientX: 7, clientY: 0 }), null);
  assert.equal(tracker.consume({ pointerId: 3, pointerType: "mouse", clientX: 0, clientY: 0 }), null);
});

test("detail response validation rejects incomplete and mismatched records", () => {
  const detail = makeDetail(0);
  assert.deepEqual(validateMoonCatDetail(detail, 0), detail);
  assert.equal(validateMoonCatDetail({ ...detail, pale: "false" }, 0), null);
  assert.equal(validateMoonCatDetail({ ...detail, rescueOrder: 1 }, 0), null);
  assert.equal(validateMoonCatDetailShard(makeShard(0), 0).length, RHOMBUS_CAT_COUNT);
  assert.equal(validateMoonCatDetailShard(makeShard(0).slice(1), 0), null);
});

test("detail loader reuses successful face loads and retries failed loads", async () => {
  let calls = 0;
  const loader = createMoonCatDetailsLoader(async () => {
    calls += 1;
    return { ok: true, json: async () => makeShard(0) };
  });
  assert.equal((await loader.load(0)).rescueOrder, 0);
  assert.equal((await loader.load(1)).rescueOrder, 1);
  assert.equal(calls, 1);

  let failedOnce = false;
  const retryLoader = createMoonCatDetailsLoader(async () => {
    if (!failedOnce) {
      failedOnce = true;
      return { ok: false, json: async () => [] };
    }
    return { ok: true, json: async () => makeShard(0) };
  });
  await assert.rejects(retryLoader.load(0));
  assert.equal((await retryLoader.load(0)).rescueOrder, 0);
});

test("generated detail shards cover all rescue orders with the requested schema", async () => {
  const directory = new URL("../public/data/mooncat-details/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^face-\d{2}\.json$/.test(file)).sort();
  assert.equal(files.length, TRI_FACE_COUNT);

  let entryCount = 0;
  for (const [faceIndex, file] of files.entries()) {
    const shard = JSON.parse(await readFile(new URL(file, directory), "utf8"));
    assert.ok(validateMoonCatDetailShard(shard, faceIndex));
    assert.deepEqual(Object.keys(shard[0]), MOONCAT_DETAIL_FIELDS);
    entryCount += shard.length;
  }
  assert.equal(entryCount, MAX_ID + 1);
});
