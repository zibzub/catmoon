import * as THREE from "three";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SavePass } from "three/addons/postprocessing/SavePass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export const RENDER_MODE_STORAGE_KEY = "catmoon.renderMode";
export const LIT_MOON_LIGHTING_DEFAULTS = Object.freeze({
  keyColor: 0xfff3df,
  keyIntensity: 1.2,
  keyPosition: Object.freeze([2.8, 3.6, 4.2]),
  fillSkyColor: 0xb7caff,
  fillGroundColor: 0x241529,
  fillIntensity: 0.5
});
export const AFTERIMAGE_PASS_ORDER = Object.freeze([
  "RenderPass",
  "AfterimagePass",
  "OutputPass"
]);
export const DEPTH_OF_FIELD_PASS_ORDER = Object.freeze([
  "RenderPass",
  "SavePass(clean alpha)",
  "BokehPass",
  "ShaderPass(RestoreAlpha)",
  "OutputPass"
]);
export const AFTERIMAGE_DEFAULTS = Object.freeze({
  persistence: 0.9,
  intensity: 0.2
});
export const DEPTH_OF_FIELD_DEFAULTS = Object.freeze({
  focus: 3,
  aperture: 0.0055,
  maxBlur: 0.005
});
export const DEPTH_OF_FIELD_STORAGE_KEY = "catmoon.depthOfFieldSettings.v2";
export const DEPTH_OF_FIELD_CONTROL_META = Object.freeze({
  focus: Object.freeze({ min: 1.5, max: 3.5, step: 0.01, decimals: 2 }),
  aperture: Object.freeze({ min: 0.0005, max: 0.02, step: 0.0005, decimals: 4 }),
  maxBlur: Object.freeze({ min: 0.001, max: 0.03, step: 0.001, decimals: 3 })
});
export const DEPTH_OF_FIELD_ALPHA_RESTORE_SHADER = {
  name: "DepthOfFieldAlphaRestoreShader",
  uniforms: {
    tDiffuse: { value: null },
    tClean: { value: null }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tClean;

    varying vec2 vUv;

    void main() {
      vec4 dof = texture2D(tDiffuse, vUv);
      float cleanAlpha = texture2D(tClean, vUv).a;
      gl_FragColor = vec4(dof.rgb, cleanAlpha);
    }
  `
};
export const ALPHA_PRESERVING_AFTERIMAGE_SHADER = {
  name: "AlphaPreservingAfterimageShader",
  uniforms: {
    persistence: { value: AFTERIMAGE_DEFAULTS.persistence },
    tOld: { value: null },
    tNew: { value: null }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform float persistence;
    uniform sampler2D tOld;
    uniform sampler2D tNew;

    varying vec2 vUv;

    void main() {
      vec4 oldFrame = texture2D(tOld, vUv);
      vec4 currentFrame = texture2D(tNew, vUv);
      vec3 history = oldFrame.rgb * persistence * step(vec3(0.1), oldFrame.rgb);
      vec3 trailTarget = max(currentFrame.rgb, history);
      gl_FragColor = vec4(trailTarget, currentFrame.a);
    }
  `
};
export const AFTERIMAGE_INTENSITY_SHADER = {
  name: "AfterimageIntensityShader",
  uniforms: {
    tTrail: { value: null },
    tCurrent: { value: null },
    intensity: { value: AFTERIMAGE_DEFAULTS.intensity }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tTrail;
    uniform sampler2D tCurrent;
    uniform float intensity;

    varying vec2 vUv;

    void main() {
      vec4 trailTarget = texture2D(tTrail, vUv);
      vec4 currentFrame = texture2D(tCurrent, vUv);
      vec3 trail = mix(currentFrame.rgb, trailTarget.rgb, intensity);
      gl_FragColor = vec4(trail, currentFrame.a);
    }
  `
};

class AlphaPreservingAfterimagePass extends Pass {
  constructor(persistence, intensity) {
    super();

    this.uniforms = {
      persistence: { value: persistence },
      tOld: { value: null },
      tNew: { value: null }
    };
    this.textureComp = new THREE.WebGLRenderTarget(1, 1, {
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType
    });
    this.textureOld = this.textureComp.clone();
    this.compMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: ALPHA_PRESERVING_AFTERIMAGE_SHADER.vertexShader,
      fragmentShader: ALPHA_PRESERVING_AFTERIMAGE_SHADER.fragmentShader,
      depthTest: false,
      depthWrite: false
    });
    this.copyUniforms = {
      tTrail: { value: null },
      tCurrent: { value: null },
      intensity: { value: intensity }
    };
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: this.copyUniforms,
      vertexShader: AFTERIMAGE_INTENSITY_SHADER.vertexShader,
      fragmentShader: AFTERIMAGE_INTENSITY_SHADER.fragmentShader,
      depthTest: false,
      depthWrite: false
    });
    this.compQuad = new FullScreenQuad(this.compMaterial);
    this.copyQuad = new FullScreenQuad(this.copyMaterial);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tOld.value = this.textureOld.texture;
    this.uniforms.tNew.value = readBuffer.texture;

    renderer.setRenderTarget(this.textureComp);
    this.compQuad.render(renderer);

    this.copyUniforms.tTrail.value = this.textureComp.texture;
    this.copyUniforms.tCurrent.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen && this.clear) renderer.clear();
    this.copyQuad.render(renderer);

    const previousHistory = this.textureOld;
    this.textureOld = this.textureComp;
    this.textureComp = previousHistory;
  }

  setSize(width, height) {
    this.textureComp.setSize(width, height);
    this.textureOld.setSize(width, height);
  }

  dispose() {
    this.textureComp.dispose();
    this.textureOld.dispose();
    this.compMaterial.dispose();
    this.copyMaterial.dispose();
    this.compQuad.dispose();
    this.copyQuad.dispose();
  }
}

function cappedDevicePixelRatio() {
  return Math.min(window.devicePixelRatio || 1, 2);
}

export function normalizeRenderMode(value) {
  if (value === "smooth-aa" || value === "effects" || value === "bloom" || value === "afterimage-mix") return "smooth";
  return value === "smooth" || value === "afterimage" || value === "depth-of-field" || value === "lit" ? value : "pixel";
}

export function modeUsesAfterimage(mode) {
  return normalizeRenderMode(mode) === "afterimage";
}

export function modeUsesDepthOfField(mode) {
  return normalizeRenderMode(mode) === "depth-of-field";
}

export function modeUsesLitMoon(mode) {
  return normalizeRenderMode(mode) === "lit";
}

const DEPTH_OF_FIELD_SETTING_KEYS = Object.freeze(["focus", "aperture", "maxBlur"]);

export function normalizeDepthOfFieldSettings(value) {
  const source = value && typeof value === "object" ? value : {};
  const settings = {};

  for (const key of DEPTH_OF_FIELD_SETTING_KEYS) {
    const raw = source[key];
    const range = DEPTH_OF_FIELD_CONTROL_META[key];
    settings[key] = Number.isFinite(raw) && raw >= range.min && raw <= range.max
      ? raw
      : DEPTH_OF_FIELD_DEFAULTS[key];
  }

  return settings;
}

export function clampDepthOfFieldValue(key, value) {
  const range = DEPTH_OF_FIELD_CONTROL_META[key];
  if (!range) return undefined;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEPTH_OF_FIELD_DEFAULTS[key];
  return Math.min(range.max, Math.max(range.min, numericValue));
}

export function loadDepthOfFieldSettings(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(DEPTH_OF_FIELD_STORAGE_KEY);
    return normalizeDepthOfFieldSettings(JSON.parse(raw));
  } catch {
    return normalizeDepthOfFieldSettings();
  }
}

export function saveDepthOfFieldSettings(storage, settings) {
  const normalized = normalizeDepthOfFieldSettings(settings);
  try {
    (storage ?? globalThis.localStorage)?.setItem(DEPTH_OF_FIELD_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage may be unavailable in private or restricted browsing contexts.
  }
  return normalized;
}

export function applyDepthOfFieldSettings(bokehPass, settings) {
  const normalized = normalizeDepthOfFieldSettings(settings);
  const uniforms = bokehPass?.materialBokeh?.uniforms;
  if (uniforms) {
    uniforms.focus.value = normalized.focus;
    uniforms.aperture.value = normalized.aperture;
    uniforms.maxblur.value = normalized.maxBlur;
  }
  return normalized;
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

export function createLitMoonLighting(scene) {
  const keyLight = new THREE.DirectionalLight(
    LIT_MOON_LIGHTING_DEFAULTS.keyColor,
    LIT_MOON_LIGHTING_DEFAULTS.keyIntensity
  );
  const fillLight = new THREE.HemisphereLight(
    LIT_MOON_LIGHTING_DEFAULTS.fillSkyColor,
    LIT_MOON_LIGHTING_DEFAULTS.fillGroundColor,
    LIT_MOON_LIGHTING_DEFAULTS.fillIntensity
  );

  keyLight.position.fromArray(LIT_MOON_LIGHTING_DEFAULTS.keyPosition);
  keyLight.visible = false;
  fillLight.visible = false;
  scene.add(keyLight, fillLight);

  return {
    setEnabled(enabled) {
      const visible = Boolean(enabled);
      keyLight.visible = visible;
      fillLight.visible = visible;
    },
    dispose() {
      scene.remove(keyLight, fillLight);
    }
  };
}

export function createAfterimageEffects(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const afterimagePass = new AlphaPreservingAfterimagePass(
    AFTERIMAGE_DEFAULTS.persistence,
    AFTERIMAGE_DEFAULTS.intensity
  );
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

export function createDepthOfFieldEffects(renderer, scene, camera, initialSettings = DEPTH_OF_FIELD_DEFAULTS) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const cleanAlphaPass = new SavePass();
  let settings = normalizeDepthOfFieldSettings(initialSettings);
  const bokehPass = new BokehPass(scene, camera, {
    focus: settings.focus,
    aperture: settings.aperture,
    maxblur: settings.maxBlur
  });
  const restoreAlphaPass = new ShaderPass(DEPTH_OF_FIELD_ALPHA_RESTORE_SHADER);
  const outputPass = new OutputPass();

  restoreAlphaPass.uniforms.tClean.value = cleanAlphaPass.renderTarget.texture;

  composer.addPass(renderPass);
  composer.addPass(cleanAlphaPass);
  composer.addPass(bokehPass);
  composer.addPass(restoreAlphaPass);
  composer.addPass(outputPass);
  applyDepthOfFieldSettings(bokehPass, settings);

  return {
    passOrder: DEPTH_OF_FIELD_PASS_ORDER,
    getSettings: () => ({ ...settings }),
    setSettings(nextSettings) {
      settings = normalizeDepthOfFieldSettings({ ...settings, ...nextSettings });
      applyDepthOfFieldSettings(bokehPass, settings);
      return { ...settings };
    },
    resize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    },
    render: () => composer.render(),
    dispose() {
      cleanAlphaPass.dispose();
      bokehPass.dispose();
      restoreAlphaPass.dispose();
      outputPass.dispose();
      composer.dispose();
    }
  };
}
