import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { SavePass } from "three/addons/postprocessing/SavePass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export const RENDER_MODE_STORAGE_KEY = "catmoon.renderMode";
export const AFTERIMAGE_PASS_ORDER = Object.freeze([
  "RenderPass",
  "AfterimagePass",
  "OutputPass"
]);
export const AFTERIMAGE_MIX_PASS_ORDER = Object.freeze([
  "RenderPass",
  "SavePass(clean frame)",
  "AfterimagePass",
  "ShaderPass(AfterimageMix)",
  "OutputPass"
]);
export const AFTERIMAGE_DEFAULTS = Object.freeze({
  persistence: 0.9,
  intensity: 0.2,
  mix: 0.75
});
export const AFTERIMAGE_MIX_SHADER = {
  name: "AfterimageMixShader",
  uniforms: {
    tDiffuse: { value: null },
    tClean: { value: null },
    mixAmount: { value: AFTERIMAGE_DEFAULTS.mix }
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
    uniform float mixAmount;

    varying vec2 vUv;

    void main() {
      vec4 clean = texture2D(tClean, vUv);
      vec4 afterimage = texture2D(tDiffuse, vUv);
      gl_FragColor = clean * (1.0 - mixAmount) + afterimage * mixAmount;
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
  if (value === "smooth-aa" || value === "effects" || value === "bloom") return "smooth";
  return value === "smooth" || value === "afterimage" || value === "afterimage-mix" ? value : "pixel";
}

export function modeUsesAfterimage(mode) {
  return normalizeRenderMode(mode) === "afterimage";
}

export function modeUsesAfterimageMix(mode) {
  return normalizeRenderMode(mode) === "afterimage-mix";
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

export function createMixedAfterimageEffects(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const cleanFramePass = new SavePass();
  const afterimagePass = new AlphaPreservingAfterimagePass(
    AFTERIMAGE_DEFAULTS.persistence,
    AFTERIMAGE_DEFAULTS.intensity
  );
  const mixPass = new ShaderPass(AFTERIMAGE_MIX_SHADER);
  const outputPass = new OutputPass();

  mixPass.uniforms.tClean.value = cleanFramePass.renderTarget.texture;

  composer.addPass(renderPass);
  composer.addPass(cleanFramePass);
  composer.addPass(afterimagePass);
  composer.addPass(mixPass);
  composer.addPass(outputPass);

  return {
    passOrder: AFTERIMAGE_MIX_PASS_ORDER,
    resize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    },
    render: () => composer.render(),
    dispose() {
      cleanFramePass.dispose();
      afterimagePass.dispose();
      mixPass.dispose();
      outputPass.dispose();
      composer.dispose();
    }
  };
}
