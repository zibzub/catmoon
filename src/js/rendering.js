import * as THREE from "three";

export const RENDER_MODE_STORAGE_KEY = "catmoon.renderMode";

export function normalizeRenderMode(value) {
  return value === "smooth" ? "smooth" : "pixel";
}

export function textureSettingsForMode(mode) {
  const isSmooth = normalizeRenderMode(mode) === "smooth";
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x050507, 0);

  return {
    renderer,
    resize(width, height) {
      renderer.setSize(width, height, false);
    },
    render(scene, camera) {
      renderer.render(scene, camera);
    }
  };
}
