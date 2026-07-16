import test from "node:test";
import assert from "node:assert/strict";

import {
  DETAIL_CARD_EXPORT_LAYOUT,
  DETAIL_CARD_EXPORT_SIZE,
  detailCardAtlasSourceRect,
  detailCardExportFilename,
  detailCardExportSummary,
  renderDetailCardCanvas
} from "../src/js/cat-details-export.js";

test("detail-card export helpers keep the validated desktop template dimensions and source atlas bounds", () => {
  assert.deepEqual(DETAIL_CARD_EXPORT_SIZE, { width: 600, height: 840 });
  assert.deepEqual(DETAIL_CARD_EXPORT_LAYOUT.image, { x: 0.085, y: 0.12, width: 0.83, height: 0.435 });
  assert.deepEqual(DETAIL_CARD_EXPORT_LAYOUT.details, { x: 0.085, y: 0.626, width: 0.83, height: 0.272 });
  assert.deepEqual(detailCardAtlasSourceRect(161), { x: 21, y: 22, width: 21, height: 22 });
  assert.equal(detailCardAtlasSourceRect(-1), null);
  assert.equal(detailCardExportFilename(42), "mooncat-42-card.png");
});

test("detail-card export helpers format the visible compact summary", () => {
  assert.equal(detailCardExportSummary({ rescueYear: 2017, hueName: "skyblue", pattern: "tortie" }), "2017 RESCUE · SKYBLUE · TORTIE");
  assert.equal(detailCardExportSummary(null), "");
});

test("detail-card export uses one desktop-card layout without panel overlap", () => {
  const calls = [];
  const context = {
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    beginPath: () => calls.push(["beginPath"]),
    rect: (...args) => calls.push(["rect", ...args]),
    clip: () => calls.push(["clip"]),
    measureText: (text) => ({ width: String(text).length * 10 }),
    fillText: (...args) => calls.push(["fillText", ...args])
  };
  const canvas = { getContext: () => context };
  renderDetailCardCanvas({
    canvas,
    templateImage: {},
    atlasImage: {},
    title: "MoonCat 42",
    coatColor: "#abcdef",
    detail: {
      rescueOrder: 42,
      rescueYear: 2017,
      hueName: "skyblue",
      pattern: "tortie",
      catId: "0x0000000000000000000000000000000000000042",
      hueInt: 210,
      pale: false,
      facing: "left",
      expression: "happy",
      pose: "standing"
    }
  });

  assert.equal(canvas.width, 600);
  assert.equal(canvas.height, 840);
  assert.deepEqual(calls.filter(([name]) => name === "fillRect").map(([, ...rect]) => rect), [
    [31.2, 31.919999999999998, 537.6, 777.84],
    [51.00000000000001, 100.8, 498, 365.4],
    [51.00000000000001, 525.84, 498, 228.48000000000002]
  ]);
  assert.ok(calls.some(([name, font]) => name === "fillText" && font === "MoonCat 42"));
});
