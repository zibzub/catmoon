import test from "node:test";
import assert from "node:assert/strict";

import { calculateFittedFontSize, isSingleLineFit } from "../src/js/cat-details-text-fit.js";

test("single-line fit treats nowrap content width as the available measure", () => {
  assert.equal(isSingleLineFit({ availableWidth: 300, measuredWidth: 300 }), true);
  assert.equal(isSingleLineFit({ availableWidth: 300, measuredWidth: 301 }), false);
  assert.equal(isSingleLineFit({ availableWidth: 0, measuredWidth: 1 }), false);
});

test("text fitting preserves the configured size when content fits", () => {
  assert.equal(calculateFittedFontSize({
    availableWidth: 300,
    measuredWidth: 240,
    maxFontSize: 29,
    minFontSize: 16
  }), 29);
});

test("text fitting scales long content down without crossing its minimum", () => {
  assert.ok(Math.abs(calculateFittedFontSize({
    availableWidth: 240,
    measuredWidth: 360,
    maxFontSize: 25,
    minFontSize: 12
  }) - (50 / 3)) < 1e-12);
  assert.equal(calculateFittedFontSize({
    availableWidth: 80,
    measuredWidth: 360,
    maxFontSize: 25,
    minFontSize: 12
  }), 12);
});
