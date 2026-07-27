import test from "node:test";
import assert from "node:assert/strict";

import { MAX_ID } from "../src/js/config.js";
import {
  normalizeRescueView,
  parseRescueUrlState,
  updateRescueUrl
} from "../src/js/rescue-url.js";

test("parseRescueUrlState accepts canonical rescue IDs and normalizes views", () => {
  assert.deepEqual(parseRescueUrlState("https://catmoon.test/?rescue=1234"), {
    rescueId: 1234,
    view: "pin"
  });
  assert.deepEqual(parseRescueUrlState("https://catmoon.test/?rescue=1234&view=pin"), {
    rescueId: 1234,
    view: "pin"
  });
  assert.deepEqual(parseRescueUrlState("https://catmoon.test/?rescue=1234&view=details"), {
    rescueId: 1234,
    view: "details"
  });
  assert.deepEqual(parseRescueUrlState("https://catmoon.test/?rescue=1234&view=unknown"), {
    rescueId: 1234,
    view: "pin"
  });
  assert.equal(normalizeRescueView(undefined), "pin");
});

test("parseRescueUrlState rejects invalid rescue values", () => {
  for (const value of [
    "",
    " ",
    "-1",
    "+1",
    "1.5",
    "1e2",
    "text",
    "9007199254740992",
    String(MAX_ID + 1)
  ]) {
    assert.equal(parseRescueUrlState(`https://catmoon.test/?rescue=${encodeURIComponent(value)}`), null);
  }
  assert.equal(parseRescueUrlState("https://catmoon.test/"), null);
});

test("updateRescueUrl preserves unrelated params and hash while canonicalizing rescue state", () => {
  const initial = "https://catmoon.test/view?wallet=cats.eth&rescue=0007&other=value#moon";
  const pinned = updateRescueUrl(new URL(initial), { rescueId: 7, view: "pin" });
  assert.equal(pinned.href, "https://catmoon.test/view?wallet=cats.eth&rescue=7&other=value#moon");

  const details = updateRescueUrl(pinned, { rescueId: 7, view: "details" });
  assert.equal(details.href, "https://catmoon.test/view?wallet=cats.eth&rescue=7&other=value&view=details#moon");

  const cleared = updateRescueUrl(details, { rescueId: null });
  assert.equal(cleared.href, "https://catmoon.test/view?wallet=cats.eth&other=value#moon");
});
