import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {
  AFTERIMAGE_DEFAULTS,
  AFTERIMAGE_PASS_ORDER,
  createTextureManager,
  modeUsesAfterimage,
  normalizeRenderMode,
  textureSettingsForMode
} from "../src/js/rendering.js";

test("render mode normalization preserves current modes and safely migrates temporary modes", () => {
  assert.equal(normalizeRenderMode(undefined), "pixel");
  assert.equal(normalizeRenderMode("pixel"), "pixel");
  assert.equal(normalizeRenderMode("smooth"), "smooth");
  assert.equal(normalizeRenderMode("afterimage"), "afterimage");
  assert.equal(normalizeRenderMode("smooth-aa"), "smooth");
  assert.equal(normalizeRenderMode("effects"), "smooth");
  assert.equal(normalizeRenderMode("bloom"), "smooth");
  assert.equal(normalizeRenderMode("unknown"), "pixel");
});

test("pixel texture settings preserve crisp no-mipmap sampling", () => {
  assert.deepEqual(textureSettingsForMode("pixel"), {
    colorSpace: THREE.SRGBColorSpace,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    generateMipmaps: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping
  });
});

test("smooth texture settings use linear mipmapped sampling", () => {
  assert.deepEqual(textureSettingsForMode("smooth"), {
    colorSpace: THREE.SRGBColorSpace,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearMipmapLinearFilter,
    generateMipmaps: true,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping
  });
});

test("afterimage keeps smooth texture settings and selects only the composer pipeline", () => {
  assert.deepEqual(textureSettingsForMode("afterimage"), textureSettingsForMode("smooth"));
  assert.equal(modeUsesAfterimage("pixel"), false);
  assert.equal(modeUsesAfterimage("smooth"), false);
  assert.equal(modeUsesAfterimage("afterimage"), true);
  assert.equal(modeUsesAfterimage("smooth-aa"), false);
});

test("Afterimage uses a restrained damp value and its own output pipeline", () => {
  assert.deepEqual(AFTERIMAGE_DEFAULTS, {
    damp: 0.92
  });
  assert.deepEqual(AFTERIMAGE_PASS_ORDER, [
    "RenderPass",
    "AfterimagePass",
    "OutputPass"
  ]);
});

test("changing modes refreshes registered textures in place", () => {
  const textureManager = createTextureManager();
  const texture = {};

  assert.equal(textureManager.applyTextureSettings(texture), texture);
  assert.equal(texture.minFilter, THREE.NearestFilter);
  assert.equal(texture.generateMipmaps, false);

  textureManager.setMode("smooth");
  assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(texture.magFilter, THREE.LinearFilter);
  assert.equal(texture.generateMipmaps, true);
  assert.equal(texture.needsUpdate, true);

  textureManager.setMode("pixel");
  assert.equal(texture.minFilter, THREE.NearestFilter);
  assert.equal(texture.magFilter, THREE.NearestFilter);
  assert.equal(texture.generateMipmaps, false);
});
