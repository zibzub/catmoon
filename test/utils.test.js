import test from "node:test";
import assert from "node:assert/strict";

import { clamp, pad2 } from "../src/js/utils.js";

test("clamp keeps values inside inclusive bounds", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test("pad2 left-pads one-digit values and leaves wider values intact", () => {
  assert.equal(pad2(0), "00");
  assert.equal(pad2(7), "07");
  assert.equal(pad2(12), "12");
  assert.equal(pad2(123), "123");
});
