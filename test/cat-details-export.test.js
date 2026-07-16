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
  const gradientCalls = [];
  const context = {
    clearRect: (...args) => calls.push(["clearRect", ...args]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    beginPath: () => calls.push(["beginPath"]),
    rect: (...args) => calls.push(["rect", ...args]),
    clip: () => calls.push(["clip"]),
    createLinearGradient: (...args) => {
      const gradient = {
        stops: [],
        addColorStop: (offset, color) => gradient.stops.push([offset, color])
      };
      gradientCalls.push({ args, gradient });
      return gradient;
    },
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
  assert.equal(gradientCalls.length, 0);
});

function makeGenesisExportContext() {
  const gradientCalls = [];
  const context = {
    clearRect() {},
    fillRect() {},
    drawImage() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    measureText: (text) => ({ width: String(text).length * 10 }),
    fillText() {},
    createLinearGradient: (...args) => {
      const gradient = {
        stops: [],
        addColorStop: (offset, color) => gradient.stops.push([offset, color])
      };
      gradientCalls.push({ args, gradient });
      return gradient;
    }
  };
  return { context, gradientCalls };
}

function makeGenesisDetail(hueInt, hueName) {
  return {
    rescueOrder: 42,
    rescueYear: 2017,
    hueName,
    hueInt,
    pattern: "solid",
    catId: "0x0000002a",
    pale: false,
    facing: "left",
    expression: "happy",
    pose: "standing"
  };
}

test("Genesis exports use distinct deterministic foil gradients while pale exports stay flat", () => {
  const black = makeGenesisExportContext();
  renderDetailCardCanvas({
    canvas: { getContext: () => black.context },
    templateImage: {},
    atlasImage: {},
    detail: makeGenesisDetail(1000, "black"),
    title: "Black Genesis",
    coatColor: "#17191f"
  });

  const white = makeGenesisExportContext();
  renderDetailCardCanvas({
    canvas: { getContext: () => white.context },
    templateImage: {},
    atlasImage: {},
    detail: makeGenesisDetail(2000, "WHITE"),
    title: "White Genesis",
    coatColor: "#f3eee4"
  });

  const pale = makeGenesisExportContext();
  renderDetailCardCanvas({
    canvas: { getContext: () => pale.context },
    templateImage: {},
    atlasImage: {},
    detail: { ...makeGenesisDetail(120, "green"), pale: true },
    title: "Pale Cat",
    coatColor: "#abc123"
  });

  const mismatch = makeGenesisExportContext();
  renderDetailCardCanvas({
    canvas: { getContext: () => mismatch.context },
    templateImage: {},
    atlasImage: {},
    detail: makeGenesisDetail(1000, "white"),
    title: "Sentinel Mismatch",
    coatColor: "#abc123"
  });

  assert.equal(black.gradientCalls.length, 1);
  assert.equal(white.gradientCalls.length, 1);
  assert.equal(pale.gradientCalls.length, 0);
  assert.equal(mismatch.gradientCalls.length, 0);
  assert.notDeepEqual(black.gradientCalls[0].gradient.stops, white.gradientCalls[0].gradient.stops);
  assert.deepEqual(white.gradientCalls[0].gradient.stops, [
    [0, "#ddd6ca"],
    [0.26, "#fffdf7"],
    [0.44, "#bfefff"],
    [0.5, "#ffd0e8"],
    [0.56, "#fff0a8"],
    [0.66, "#fffdf7"],
    [1, "#e8e1d6"]
  ]);
  const expectedGradientArgs = [
    DETAIL_CARD_EXPORT_SIZE.width * DETAIL_CARD_EXPORT_LAYOUT.coatRail.x,
    DETAIL_CARD_EXPORT_SIZE.height * (DETAIL_CARD_EXPORT_LAYOUT.coatRail.y + DETAIL_CARD_EXPORT_LAYOUT.coatRail.height),
    DETAIL_CARD_EXPORT_SIZE.width * (DETAIL_CARD_EXPORT_LAYOUT.coatRail.x + DETAIL_CARD_EXPORT_LAYOUT.coatRail.width),
    DETAIL_CARD_EXPORT_SIZE.height * DETAIL_CARD_EXPORT_LAYOUT.coatRail.y
  ];
  black.gradientCalls[0].args.forEach((value, index) => {
    assert.ok(Math.abs(value - expectedGradientArgs[index]) < 1e-9);
  });
});
