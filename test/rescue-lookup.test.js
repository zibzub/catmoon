import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {
  parseRescueId,
  rescueIdToFaceSlot,
  resolveRescueTargetData
} from "../src/js/catmoon-geometry.js";
import { MAX_ID, RHOMBUS_CAT_COUNT, TRI_FACE_TEX_H, TRI_FACE_TEX_W } from "../src/js/config.js";

test("parseRescueId accepts only trimmed whole rescue IDs in range", () => {
  assert.equal(parseRescueId(" 0 "), 0);
  assert.equal(parseRescueId("000"), 0);
  assert.equal(parseRescueId(`${MAX_ID}`), MAX_ID);

  for (const value of ["", " ", "0.5", "+1", "-1", "1cat", "1e2", `${MAX_ID + 1}`]) {
    assert.equal(parseRescueId(value), null, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test("rescue IDs map across the first and final rhombus slots", () => {
  assert.deepEqual(rescueIdToFaceSlot(0), { id: 0, faceIndex: 0, slotId: 0 });
  assert.deepEqual(rescueIdToFaceSlot(MAX_ID), {
    id: MAX_ID,
    faceIndex: 29,
    slotId: RHOMBUS_CAT_COUNT - 1
  });
  assert.equal(rescueIdToFaceSlot(-1), null);
  assert.equal(rescueIdToFaceSlot(MAX_ID + 1), null);
});

test("rescue target data resolves the exact slot center on its rhombus", () => {
  const triFaceSlots = Array.from({ length: 30 }, () => []);
  const faceVertices = Array.from({ length: 30 }, () => null);
  const faceUps = Array.from({ length: 30 }, () => null);
  triFaceSlots[0] = [{
    id: 0,
    x: TRI_FACE_TEX_W * 0.75,
    y: TRI_FACE_TEX_H * 0.5
  }];
  faceVertices[0] = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(-1, 0, 0)
  ];
  faceUps[0] = new THREE.Vector3(0, 1, 0);
  triFaceSlots[29] = [{ id: RHOMBUS_CAT_COUNT - 1, x: TRI_FACE_TEX_W * 0.5, y: TRI_FACE_TEX_H * 0.5 }];
  faceVertices[29] = faceVertices[0].map((vertex) => vertex.clone().add(new THREE.Vector3(0, 0, 1)));
  faceUps[29] = new THREE.Vector3(0, 1, 0);

  const target = resolveRescueTargetData(0, triFaceSlots, faceVertices, faceUps);
  assert.ok(target);
  assert.deepEqual({ faceIndex: target.faceIndex, slotId: target.slotId }, { faceIndex: 0, slotId: 0 });
  assert.deepEqual(target.localPoint.toArray(), [0.5, 0, 0]);
  assert.deepEqual(target.normal.toArray(), [1, 0, 0]);
  assert.ok(Math.abs(target.up.dot(target.normal)) < 0.000001);

  const finalTarget = resolveRescueTargetData(MAX_ID, triFaceSlots, faceVertices, faceUps);
  assert.deepEqual(
    { faceIndex: finalTarget.faceIndex, slotId: finalTarget.slotId },
    { faceIndex: 29, slotId: RHOMBUS_CAT_COUNT - 1 }
  );
});

test("rescue target data fails cleanly when geometry or its exact slot is unavailable", () => {
  assert.equal(resolveRescueTargetData(0, [], [], []), null);
  assert.equal(resolveRescueTargetData(0, [[]], [[]], [new THREE.Vector3(0, 1, 0)]), null);
});
