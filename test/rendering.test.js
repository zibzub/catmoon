import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {
  ALPHA_PRESERVING_AFTERIMAGE_SHADER,
  AFTERIMAGE_INTENSITY_SHADER,
  AFTERIMAGE_DEFAULTS,
  AFTERIMAGE_MIX_PASS_ORDER,
  AFTERIMAGE_MIX_TRAIL_INTENSITY,
  AFTERIMAGE_MIX_SHADER,
  AFTERIMAGE_PASS_ORDER,
  createTextureManager,
  modeUsesAfterimage,
  modeUsesAfterimageMix,
  normalizeRenderMode,
  textureSettingsForMode
} from "../src/js/rendering.js";

test("render mode normalization preserves current modes and safely migrates temporary modes", () => {
  assert.equal(normalizeRenderMode(undefined), "pixel");
  assert.equal(normalizeRenderMode("pixel"), "pixel");
  assert.equal(normalizeRenderMode("smooth"), "smooth");
  assert.equal(normalizeRenderMode("afterimage"), "afterimage");
  assert.equal(normalizeRenderMode("afterimage-mix"), "afterimage-mix");
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
  assert.equal(modeUsesAfterimage("afterimage-mix"), false);
  assert.equal(modeUsesAfterimage("smooth-aa"), false);
});

test("mixed afterimage keeps smooth texture settings and selects only its composer pipeline", () => {
  assert.deepEqual(textureSettingsForMode("afterimage-mix"), textureSettingsForMode("smooth"));
  assert.equal(modeUsesAfterimageMix("pixel"), false);
  assert.equal(modeUsesAfterimageMix("smooth"), false);
  assert.equal(modeUsesAfterimageMix("afterimage"), false);
  assert.equal(modeUsesAfterimageMix("afterimage-mix"), true);
});

test("Afterimage defaults separate persistence, intensity, and final mix", () => {
  assert.deepEqual(AFTERIMAGE_DEFAULTS, {
    persistence: 0.9,
    intensity: 0.2,
    mix: 0.75
  });
  assert.deepEqual(AFTERIMAGE_PASS_ORDER, [
    "RenderPass",
    "AfterimagePass",
    "OutputPass"
  ]);
});

test("full Afterimage keeps configured intensity while Mixed Afterimage uses full trail strength", () => {
  assert.equal(AFTERIMAGE_INTENSITY_SHADER.uniforms.intensity.value, AFTERIMAGE_DEFAULTS.intensity);
  assert.equal(AFTERIMAGE_MIX_TRAIL_INTENSITY, 1);
  assert.notEqual(AFTERIMAGE_MIX_TRAIL_INTENSITY, AFTERIMAGE_DEFAULTS.intensity);
});

test("Afterimage separates RGB persistence and intensity while preserving current-frame alpha", () => {
  assert.equal(
    ALPHA_PRESERVING_AFTERIMAGE_SHADER.uniforms.persistence.value,
    AFTERIMAGE_DEFAULTS.persistence
  );
  assert.match(
    ALPHA_PRESERVING_AFTERIMAGE_SHADER.fragmentShader,
    /oldFrame\.rgb \* persistence \* step\(vec3\(0\.1\), oldFrame\.rgb\)/
  );
  assert.match(
    ALPHA_PRESERVING_AFTERIMAGE_SHADER.fragmentShader,
    /vec3 trailTarget = max\(currentFrame\.rgb, history\)/
  );
  assert.match(
    ALPHA_PRESERVING_AFTERIMAGE_SHADER.fragmentShader,
    /gl_FragColor = vec4\(trailTarget, currentFrame\.a\)/
  );
  assert.equal(
    AFTERIMAGE_INTENSITY_SHADER.uniforms.intensity.value,
    AFTERIMAGE_DEFAULTS.intensity
  );
  assert.match(
    AFTERIMAGE_INTENSITY_SHADER.fragmentShader,
    /vec3 trail = mix\(currentFrame\.rgb, trailTarget\.rgb, intensity\)/
  );
  assert.match(
    AFTERIMAGE_INTENSITY_SHADER.fragmentShader,
    /gl_FragColor = vec4\(trail, currentFrame\.a\)/
  );
  assert.doesNotMatch(ALPHA_PRESERVING_AFTERIMAGE_SHADER.fragmentShader, /intensity/);
  assert.doesNotMatch(AFTERIMAGE_INTENSITY_SHADER.fragmentShader, /persistence/);
  assert.doesNotMatch(ALPHA_PRESERVING_AFTERIMAGE_SHADER.fragmentShader, /oldFrame\.a/);
});

test("mixed Afterimage saves the clean frame and blends it with the processed frame", () => {
  assert.deepEqual(AFTERIMAGE_MIX_PASS_ORDER, [
    "RenderPass",
    "SavePass(clean frame)",
    "AfterimagePass",
    "ShaderPass(AfterimageMix)",
    "OutputPass"
  ]);
  assert.equal(AFTERIMAGE_MIX_SHADER.uniforms.mixAmount.value, AFTERIMAGE_DEFAULTS.mix);
  assert.match(
    AFTERIMAGE_MIX_SHADER.fragmentShader,
    /clean \* \(1\.0 - mixAmount\) \+ afterimage \* mixAmount/
  );
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
