import * as THREE from "three";

export const BACKGROUND_MODES = Object.freeze({
  HYBRID_STARFIELD: "hybrid-starfield"
});
export const DEFAULT_BACKGROUND_MODE = BACKGROUND_MODES.HYBRID_STARFIELD;
export const HYBRID_STARFIELD_DEFAULTS = Object.freeze({
  seed: 0x4d6f6f6e,
  desktopCount: 450,
  mobileCount: 180,
  controlRotationCoupling: 0.16,
  moonRotationCoupling: 0.12,
  driftX: 0.004,
  driftY: 0.007,
  layers: Object.freeze([
    Object.freeze({ name: "far", desktopCount: 280, mobileCount: 110, radialNear: 24, radialFar: 32, size: 0.07, opacity: 0.3, brightnessMin: 0.42, brightnessMax: 0.76 }),
    Object.freeze({ name: "mid", desktopCount: 125, mobileCount: 50, radialNear: 18, radialFar: 24, size: 0.1, opacity: 0.42, brightnessMin: 0.56, brightnessMax: 0.9 }),
    Object.freeze({ name: "near", desktopCount: 45, mobileCount: 20, radialNear: 14, radialFar: 18, size: 0.14, opacity: 0.58, brightnessMin: 0.72, brightnessMax: 1 })
  ])
});

const IDENTITY_QUATERNION = new THREE.Quaternion();

export function normalizeBackgroundMode(value) {
  return value === BACKGROUND_MODES.HYBRID_STARFIELD
    ? value
    : DEFAULT_BACKGROUND_MODE;
}

export function selectStarfieldDensity({ viewportWidth = 1024, coarsePointer = false } = {}) {
  return coarsePointer || viewportWidth < 720 ? "mobile" : "desktop";
}

export function createSeededRandom(seed = HYBRID_STARFIELD_DEFAULTS.seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createStarfieldLayerData({ count, radialNear, radialFar, random }) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const zDirection = (random() * 2) - 1;
    const angle = random() * Math.PI * 2;
    const planarDirection = Math.sqrt(1 - (zDirection * zDirection));
    const distance = radialNear + ((radialFar - radialNear) * random());
    const positionIndex = index * 3;
    positions[positionIndex] = Math.cos(angle) * planarDirection * distance;
    positions[positionIndex + 1] = Math.sin(angle) * planarDirection * distance;
    positions[positionIndex + 2] = zDirection * distance;
  }

  return { positions, colors };
}

function createStarLayer(layer, density, random) {
  const count = density === "mobile" ? layer.mobileCount : layer.desktopCount;
  const { positions, colors } = createStarfieldLayerData({ ...layer, count, random });

  for (let index = 0; index < count; index += 1) {
    const brightness = layer.brightnessMin + ((layer.brightnessMax - layer.brightnessMin) * random());
    const colorIndex = index * 3;
    colors[colorIndex] = brightness;
    colors[colorIndex + 1] = brightness * 0.98;
    colors[colorIndex + 2] = Math.min(1, brightness * 1.04);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.PointsMaterial({
    size: layer.size,
    vertexColors: true,
    transparent: true,
    opacity: layer.opacity,
    depthWrite: false,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geometry, material);
  points.name = `catmoon-starfield-${layer.name}`;
  points.renderOrder = -100;
  points.raycast = () => {};
  return points;
}

export function createBackgroundController({
  scene,
  viewportWidth,
  coarsePointer = false,
  defaults = HYBRID_STARFIELD_DEFAULTS
} = {}) {
  const density = selectStarfieldDensity({ viewportWidth, coarsePointer });
  const cameraAnchor = new THREE.Group();
  const coupledGroup = new THREE.Group();
  const driftGroup = new THREE.Group();
  const random = createSeededRandom(defaults.seed);
  const moonCoupling = new THREE.Quaternion();
  let mode = DEFAULT_BACKGROUND_MODE;
  let enabled = true;

  cameraAnchor.name = "catmoon-hybrid-starfield";
  cameraAnchor.renderOrder = -100;
  cameraAnchor.add(coupledGroup);
  coupledGroup.add(driftGroup);
  defaults.layers.forEach((layer) => driftGroup.add(createStarLayer(layer, density, random)));
  scene?.add(cameraAnchor);

  function update({ cameraQuaternion, moonQuaternion, deltaSeconds = 0 } = {}) {
    if (cameraQuaternion) cameraAnchor.quaternion.copy(cameraQuaternion);

    coupledGroup.quaternion.slerpQuaternions(
      IDENTITY_QUATERNION,
      cameraQuaternion || IDENTITY_QUATERNION,
      defaults.controlRotationCoupling
    );
    if (moonQuaternion) {
      moonCoupling.slerpQuaternions(
        IDENTITY_QUATERNION,
        moonQuaternion,
        defaults.moonRotationCoupling
      );
      coupledGroup.quaternion.multiply(moonCoupling);
    }

    driftGroup.rotation.x += defaults.driftX * deltaSeconds;
    driftGroup.rotation.y += defaults.driftY * deltaSeconds;
  }

  function updateVisibility() {
    cameraAnchor.visible = enabled && mode === BACKGROUND_MODES.HYBRID_STARFIELD;
  }

  return {
    object: cameraAnchor,
    getDensity: () => density,
    getMode: () => mode,
    setEnabled(nextEnabled) {
      enabled = Boolean(nextEnabled);
      updateVisibility();
      return enabled;
    },
    setMode(nextMode) {
      mode = normalizeBackgroundMode(nextMode);
      updateVisibility();
      return mode;
    },
    update,
    resize() {
      return density;
    },
    dispose() {
      for (const points of driftGroup.children) {
        points.geometry.dispose();
        points.material.dispose();
      }
      scene?.remove(cameraAnchor);
    }
  };
}
