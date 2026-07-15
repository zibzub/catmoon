import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import { loadBooleanSetting, saveBooleanSetting } from "../src/js/dom.js";
import {
  BACKGROUND_MODES,
  DEFAULT_BACKGROUND_MODE,
  HYBRID_STARFIELD_DEFAULTS,
  createBackgroundController,
  createSeededRandom,
  createStarfieldLayerData,
  normalizeBackgroundMode,
  selectStarfieldDensity
} from "../src/js/backgrounds.js";

test("3D starfield visibility persistence defaults on and rejects malformed values", () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); }
  };

  assert.equal(loadBooleanSetting(storage, "catmoon.hybridStarfieldEnabled.v1", true), true);
  values.set("catmoon.hybridStarfieldEnabled.v1", "unexpected");
  assert.equal(loadBooleanSetting(storage, "catmoon.hybridStarfieldEnabled.v1", true), true);
  assert.equal(saveBooleanSetting(storage, "catmoon.hybridStarfieldEnabled.v1", false), false);
  assert.equal(loadBooleanSetting(storage, "catmoon.hybridStarfieldEnabled.v1", true), false);
  assert.equal(saveBooleanSetting(storage, "catmoon.hybridStarfieldEnabled.v1", true), true);
  assert.equal(loadBooleanSetting(storage, "catmoon.hybridStarfieldEnabled.v1", true), true);
});

test("hybrid starfield generation is seeded and layered", () => {
  const first = createSeededRandom(1234);
  const second = createSeededRandom(1234);
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);

  const layer = HYBRID_STARFIELD_DEFAULTS.layers[0];
  const dataA = createStarfieldLayerData({ count: 4, ...layer, random: createSeededRandom(7) });
  const dataB = createStarfieldLayerData({ count: 4, ...layer, random: createSeededRandom(7) });
  assert.deepEqual(dataA.positions, dataB.positions);
  assert.equal(dataA.positions.length, 12);
  assert.equal(HYBRID_STARFIELD_DEFAULTS.layers.length, 3);
  assert.equal(HYBRID_STARFIELD_DEFAULTS.desktopCount, 675);
  assert.equal(HYBRID_STARFIELD_DEFAULTS.mobileCount, 270);
});

test("starfield layers use radial shells with full-sphere hemisphere coverage", () => {
  for (const layer of HYBRID_STARFIELD_DEFAULTS.layers) {
    const data = createStarfieldLayerData({
      count: 512,
      ...layer,
      random: createSeededRandom(layer.name.length)
    });
    const signs = { positiveX: false, negativeX: false, positiveY: false, negativeY: false, positiveZ: false, negativeZ: false };

    for (let index = 0; index < data.positions.length; index += 3) {
      const x = data.positions[index];
      const y = data.positions[index + 1];
      const z = data.positions[index + 2];
      const distance = Math.hypot(x, y, z);
      assert.ok(distance >= layer.radialNear - 0.001);
      assert.ok(distance <= layer.radialFar + 0.001);
      signs.positiveX ||= x > 0;
      signs.negativeX ||= x < 0;
      signs.positiveY ||= y > 0;
      signs.negativeY ||= y < 0;
      signs.positiveZ ||= z > 0;
      signs.negativeZ ||= z < 0;
    }

    assert.ok(Object.values(signs).every(Boolean));
  }
});

test("hybrid starfield uses lower mobile density and a future-safe mode default", () => {
  assert.equal(selectStarfieldDensity({ viewportWidth: 1024 }), "desktop");
  assert.equal(selectStarfieldDensity({ viewportWidth: 600 }), "mobile");
  assert.equal(selectStarfieldDensity({ viewportWidth: 1200, coarsePointer: true }), "mobile");
  assert.equal(normalizeBackgroundMode(BACKGROUND_MODES.HYBRID_STARFIELD), BACKGROUND_MODES.HYBRID_STARFIELD);
  assert.equal(normalizeBackgroundMode("future-mode"), DEFAULT_BACKGROUND_MODE);
});

test("background controller updates in place and disposes its scene objects", () => {
  const scene = new THREE.Scene();
  const controller = createBackgroundController({ scene, viewportWidth: 390 });
  const cameraQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.2, 0));
  const moonQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0));

  assert.equal(controller.getDensity(), "mobile");
  assert.equal(controller.getMode(), DEFAULT_BACKGROUND_MODE);
  assert.equal(scene.children.length, 1);
  assert.equal(controller.object.children[0].children[0].children.length, 3);
  assert.equal(
    controller.object.children[0].children[0].children.reduce(
      (count, layer) => count + layer.geometry.attributes.position.count,
      0
    ),
    HYBRID_STARFIELD_DEFAULTS.mobileCount
  );
  const firstLayerGeometry = controller.object.children[0].children[0].children[0].geometry;
  controller.update({ cameraQuaternion, moonQuaternion, deltaSeconds: 1 });
  assert.notDeepEqual(controller.object.quaternion.toArray(), new THREE.Quaternion().toArray());
  assert.equal(controller.resize(), "mobile");
  assert.equal(controller.setMode("unknown"), DEFAULT_BACKGROUND_MODE);
  assert.equal(controller.setEnabled(false), false);
  assert.equal(controller.object.visible, false);
  assert.equal(controller.object.children[0].children[0].children[0].geometry, firstLayerGeometry);
  assert.equal(controller.setEnabled(true), true);
  assert.equal(controller.object.visible, true);
  controller.dispose();
  assert.equal(scene.children.length, 0);
});
