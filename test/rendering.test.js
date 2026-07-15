import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

import {
  ALPHA_PRESERVING_AFTERIMAGE_SHADER,
  AFTERIMAGE_INTENSITY_SHADER,
  AFTERIMAGE_DEFAULTS,
  AFTERIMAGE_PASS_ORDER,
  DEPTH_OF_FIELD_ALPHA_RESTORE_SHADER,
  DEPTH_OF_FIELD_CONTROL_META,
  DEPTH_OF_FIELD_DEFAULTS,
  DEPTH_OF_FIELD_PASS_ORDER,
  LIT_MOON_LIGHTING_DEFAULTS,
  applyDepthOfFieldSettings,
  clampDepthOfFieldValue,
  createLitMoonLighting,
  createTextureManager,
  loadDepthOfFieldSettings,
  modeUsesAfterimage,
  modeUsesDepthOfField,
  modeUsesLitMoon,
  normalizeDepthOfFieldSettings,
  normalizeRenderMode,
  saveDepthOfFieldSettings,
  textureSettingsForMode
} from "../src/js/rendering.js";

test("render mode normalization preserves current modes and safely migrates temporary modes", () => {
  assert.equal(normalizeRenderMode(undefined), "pixel");
  assert.equal(normalizeRenderMode("pixel"), "pixel");
  assert.equal(normalizeRenderMode("smooth"), "smooth");
  assert.equal(normalizeRenderMode("afterimage"), "afterimage");
  assert.equal(normalizeRenderMode("depth-of-field"), "depth-of-field");
  assert.equal(normalizeRenderMode("lit"), "lit");
  assert.equal(normalizeRenderMode("smooth-aa"), "smooth");
  assert.equal(normalizeRenderMode("effects"), "smooth");
  assert.equal(normalizeRenderMode("bloom"), "smooth");
  assert.equal(normalizeRenderMode("afterimage-mix"), "smooth");
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
  assert.equal(modeUsesAfterimage("depth-of-field"), false);
  assert.equal(modeUsesAfterimage("smooth-aa"), false);
});

test("depth of field keeps smooth texture settings and selects only its composer pipeline", () => {
  assert.deepEqual(textureSettingsForMode("depth-of-field"), textureSettingsForMode("smooth"));
  assert.equal(modeUsesDepthOfField("pixel"), false);
  assert.equal(modeUsesDepthOfField("smooth"), false);
  assert.equal(modeUsesDepthOfField("afterimage"), false);
  assert.equal(modeUsesDepthOfField("depth-of-field"), true);
});

test("Lit Moon keeps smooth texture settings and selects only its lighting mode", () => {
  assert.deepEqual(textureSettingsForMode("lit"), textureSettingsForMode("smooth"));
  assert.equal(modeUsesLitMoon("pixel"), false);
  assert.equal(modeUsesLitMoon("smooth"), false);
  assert.equal(modeUsesLitMoon("afterimage"), false);
  assert.equal(modeUsesLitMoon("depth-of-field"), false);
  assert.equal(modeUsesLitMoon("lit"), true);
});

test("Lit Moon lighting is centralized, disabled by default, and removable", () => {
  assert.deepEqual(LIT_MOON_LIGHTING_DEFAULTS, {
    keyColor: 0xfff3df,
    keyIntensity: 1.2,
    keyPosition: [2.8, 3.6, 4.2],
    fillSkyColor: 0xb7caff,
    fillGroundColor: 0x241529,
    fillIntensity: 0.5
  });

  const scene = new THREE.Scene();
  const lighting = createLitMoonLighting(scene);
  assert.equal(scene.children.length, 2);
  assert.ok(scene.children.every((light) => light.visible === false));

  lighting.setEnabled(true);
  assert.ok(scene.children.every((light) => light.visible === true));

  lighting.setEnabled(false);
  assert.ok(scene.children.every((light) => light.visible === false));

  lighting.dispose();
  assert.equal(scene.children.length, 0);
});

test("Tracer Moon defaults remain unchanged", () => {
  assert.deepEqual(AFTERIMAGE_DEFAULTS, {
    persistence: 0.9,
    intensity: 0.2
  });
  assert.deepEqual(AFTERIMAGE_PASS_ORDER, [
    "RenderPass",
    "AfterimagePass",
    "OutputPass"
  ]);
});

test("Tracer Moon keeps its configured intensity", () => {
  assert.equal(AFTERIMAGE_INTENSITY_SHADER.uniforms.intensity.value, AFTERIMAGE_DEFAULTS.intensity);
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

test("depth of field uses restrained defaults and restores clean-frame alpha", () => {
  assert.deepEqual(DEPTH_OF_FIELD_DEFAULTS, {
    focus: 2.45,
    aperture: 0.0025,
    maxBlur: 0.004
  });
  assert.deepEqual(DEPTH_OF_FIELD_PASS_ORDER, [
    "RenderPass",
    "SavePass(clean alpha)",
    "BokehPass",
    "ShaderPass(RestoreAlpha)",
    "OutputPass"
  ]);
  assert.match(
    DEPTH_OF_FIELD_ALPHA_RESTORE_SHADER.fragmentShader,
    /float cleanAlpha = texture2D\(tClean, vUv\)\.a/
  );
  assert.match(
    DEPTH_OF_FIELD_ALPHA_RESTORE_SHADER.fragmentShader,
    /gl_FragColor = vec4\(dof\.rgb, cleanAlpha\)/
  );
});

test("Depth of Field controls normalize defaults, ranges, and persistence defensively", () => {
  assert.deepEqual(DEPTH_OF_FIELD_CONTROL_META.focus, {
    min: 1.5,
    max: 3.5,
    step: 0.01,
    decimals: 2
  });
  assert.deepEqual(normalizeDepthOfFieldSettings({
    focus: 2.75,
    aperture: 0.01,
    maxBlur: 0.02
  }), {
    focus: 2.75,
    aperture: 0.01,
    maxBlur: 0.02
  });
  assert.deepEqual(normalizeDepthOfFieldSettings({
    focus: Number.NaN,
    aperture: 99,
    maxBlur: -1
  }), DEPTH_OF_FIELD_DEFAULTS);
  assert.equal(clampDepthOfFieldValue("focus", 99), DEPTH_OF_FIELD_CONTROL_META.focus.max);
  assert.equal(clampDepthOfFieldValue("aperture", 0), DEPTH_OF_FIELD_CONTROL_META.aperture.min);
  assert.equal(clampDepthOfFieldValue("maxBlur", "bad"), DEPTH_OF_FIELD_DEFAULTS.maxBlur);

  const values = new Map([["catmoon.depthOfFieldSettings.v1", JSON.stringify({
    focus: 1.75,
    aperture: "bad",
    maxBlur: 0.03
  })]]);
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); }
  };
  assert.deepEqual(loadDepthOfFieldSettings(storage), {
    focus: 1.75,
    aperture: DEPTH_OF_FIELD_DEFAULTS.aperture,
    maxBlur: 0.03
  });
  const saved = saveDepthOfFieldSettings(storage, { focus: 2.2, aperture: 0.005, maxBlur: 0.01 });
  assert.deepEqual(saved, { focus: 2.2, aperture: 0.005, maxBlur: 0.01 });
  assert.deepEqual(loadDepthOfFieldSettings(storage), saved);
});

test("Depth of Field runtime updates Bokeh uniforms without replacing the pass", () => {
  const bokehPass = {
    materialBokeh: {
      uniforms: {
        focus: { value: 0 },
        aperture: { value: 0 },
        maxblur: { value: 0 }
      }
    }
  };
  const first = applyDepthOfFieldSettings(bokehPass, DEPTH_OF_FIELD_DEFAULTS);
  assert.deepEqual(first, DEPTH_OF_FIELD_DEFAULTS);
  assert.equal(bokehPass.materialBokeh.uniforms.focus.value, DEPTH_OF_FIELD_DEFAULTS.focus);
  assert.equal(bokehPass.materialBokeh.uniforms.aperture.value, DEPTH_OF_FIELD_DEFAULTS.aperture);
  assert.equal(bokehPass.materialBokeh.uniforms.maxblur.value, DEPTH_OF_FIELD_DEFAULTS.maxBlur);

  const samePass = bokehPass;
  const updated = applyDepthOfFieldSettings(samePass, { focus: 1.9, aperture: 0.01, maxBlur: 0.02 });
  assert.equal(samePass, bokehPass);
  assert.deepEqual(updated, { focus: 1.9, aperture: 0.01, maxBlur: 0.02 });
  assert.equal(bokehPass.materialBokeh.uniforms.focus.value, 1.9);
  assert.equal(bokehPass.materialBokeh.uniforms.aperture.value, 0.01);
  assert.equal(bokehPass.materialBokeh.uniforms.maxblur.value, 0.02);
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
