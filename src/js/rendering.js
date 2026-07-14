import * as THREE from "three";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";

export const RENDER_MODE_STORAGE_KEY = "catmoon.renderMode";
export const AFTERIMAGE_PASS_ORDER = Object.freeze([
  "RenderPass",
  "AfterimagePass",
  "OutputPass"
]);
export const AFTERIMAGE_DEFAULTS = Object.freeze({
  damp: 0.05
});

function cappedDevicePixelRatio() {
  return Math.min(window.devicePixelRatio || 1, 2);
}

export function normalizeRenderMode(value) {
  if (value === "smooth-aa" || value === "effects" || value === "bloom") return "smooth";
  return value === "smooth" || value === "afterimage" ? value : "pixel";
}

export function modeUsesAfterimage(mode) {
  return normalizeRenderMode(mode) === "afterimage";
}

export function textureSettingsForMode(mode) {
  const isSmooth = normalizeRenderMode(mode) !== "pixel";
  return {
    colorSpace: THREE.SRGBColorSpace,
    magFilter: isSmooth ? THREE.LinearFilter : THREE.NearestFilter,
    minFilter: isSmooth ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter,
    generateMipmaps: isSmooth,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping
  };
}

export function createTextureManager(initialMode = "pixel") {
  let mode = normalizeRenderMode(initialMode);
  const textures = new Set();

  function applyTextureSettings(texture) {
    if (!texture) return texture;

    Object.assign(texture, textureSettingsForMode(mode));
    texture.needsUpdate = true;
    textures.add(texture);
    return texture;
  }

  function setMode(nextMode) {
    mode = normalizeRenderMode(nextMode);
    for (const texture of textures) {
      applyTextureSettings(texture);
    }
    return mode;
  }

  return {
    applyTextureSettings,
    getMode: () => mode,
    setMode,
    unregisterTexture: (texture) => textures.delete(texture)
  };
}

export function createCatMoonRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true
  });
  renderer.setPixelRatio(cappedDevicePixelRatio());
  renderer.setClearColor(0x050507, 0);

  return {
    renderer,
    resize(width, height) {
      renderer.setPixelRatio(cappedDevicePixelRatio());
      renderer.setSize(width, height, false);
    },
    render(scene, camera) {
      renderer.render(scene, camera);
    }
  };
}

export function createAfterimageEffects(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const afterimagePass = new AfterimagePass(AFTERIMAGE_DEFAULTS.damp);
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(afterimagePass);
  composer.addPass(outputPass);

  return {
    passOrder: AFTERIMAGE_PASS_ORDER,
    resize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    },
    render: () => composer.render(),
    dispose() {
      afterimagePass.dispose();
      outputPass.dispose();
      composer.dispose();
    }
  };
}
