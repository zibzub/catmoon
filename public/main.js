import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";

const COLS = 160;
const ROWS = 159;
const TILE_W = 21;
const TILE_H = 22;
const ATLAS_W = COLS * TILE_W;
const ATLAS_H = ROWS * TILE_H;
const MAX_ID = COLS * ROWS - 1;
const PREVIEW_SCALE = 8;
const CLICK_MOVE_LIMIT = 6;
const TOOLTIP_INACTIVITY_HIDE_MS = 3000;
const PHI = (1 + Math.sqrt(5)) / 2;
const TRI_FACE_COUNT = 30;
const RHOMBUS_CAT_COUNT = 848;
const TRI_MIN_DISTANCE = 0.55;
const TRI_MAX_DISTANCE = 7;
const TRI_FACE_BASE_SHORT_DIAG = 768;
const TRI_FACE_TEXTURE_SCALE = 2;
// Future mobile optimization: lower scale, alternate img/tri-faces-mobile/, a face atlas, or compressed textures.
const TRI_FACE_SHORT_DIAG = TRI_FACE_BASE_SHORT_DIAG * TRI_FACE_TEXTURE_SCALE;
const TRI_FACE_LONG_DIAG = Math.round(TRI_FACE_SHORT_DIAG * PHI);
const TRI_FACE_TEX_W = TRI_FACE_SHORT_DIAG;
const TRI_FACE_TEX_H = TRI_FACE_LONG_DIAG;
const TRI_FACE_CAT_PIXEL_SCALE = 2;
const TRI_FACE_METADATA_URL = "img/tri-faces/tri-face-slots.compact.json";
const TRI_FACE_TEXTURE_DIR = "img/tri-faces";
const TRI_FACE_TEXTURE_PREFIX = "tri-face-";
const TOUCH_TWIST_ROLL_SPEED = 1.0;
const DESKTOP_ROLL_DRAG_SPEED = 0.006;
const AUTO_ROTATE_ENABLED = true;
const AUTO_ROTATE_SPEED_X = 0.035;
const AUTO_ROTATE_SPEED_Y = 0.055;
const AUTO_ROTATE_SPEED_Z = 0.01;
const AUTO_ROTATE_RESUME_DELAY_MS = 5000;
const AUTO_ROTATE_EASE_IN_MS = 1000;
const STAR_PARALLAX_ENABLED = true;
const STAR_PARALLAX_SMALL_STRENGTH = 36;
const STAR_PARALLAX_LARGE_STRENGTH = 18;
const STAR_PARALLAX_EASE = 0.06;
const DRAG_RELEASE_MOMENTUM_MULTIPLIER = 1.6;

const smallStarsEl = document.getElementById("small-stars");
const largeStarsEl = document.getElementById("large-stars");
const canvas = document.getElementById("scene");
const hud = document.getElementById("hud");
const hudLockButton = document.getElementById("hudLockButton");
const catIdEl = document.getElementById("catId");
const previewEl = document.getElementById("preview");
const tooltipEl = document.getElementById("tooltip");
const statusEl = document.getElementById("status");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingProgressEl = document.getElementById("loadingProgress");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x050507, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 0, 3.15);

const controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.4;
controls.panSpeed = 0;
controls.noPan = true;
controls.noZoom = false;
controls.staticMoving = false;
controls.dynamicDampingFactor = 0.08 / DRAG_RELEASE_MOMENTUM_MULTIPLIER;
controls.minDistance = TRI_MIN_DISTANCE;
controls.maxDistance = TRI_MAX_DISTANCE;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const textureLoader = new THREE.TextureLoader();

let triacontahedron = null;
let activeObject = null;
let animationStarted = false;
let hoveredId = null;
let hudUnlocked = false;
let previewAtlasLoaded = false;
let previewAtlasLoading = false;
let tooltipHideTimer = null;
let pointerInside = false;
let lastClientX = 0;
let lastClientY = 0;
let downPoint = null;
const triFaceSlots = [];
const triFaceTexturePromises = [];
const triTextureStats = {
  prerenderedLoaded: 0,
  metadataLoaded: false,
  textureErrors: 0
};
const activePointers = new Map();
let twoFingerLastAngle = null;
let touchGestureWasTwoFinger = false;
let rollDrag = null;
let autoRotateResumeAt = 0;
let autoRotateActiveSince = performance.now();
let lastFrameTime = performance.now();
const starParallax = {
  smallX: 0,
  smallY: 0,
  largeX: 0,
  largeY: 0
};
const parallaxCameraVector = new THREE.Vector3();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function triFaceTextureUrl(faceIndex) {
  return `${TRI_FACE_TEXTURE_DIR}/${TRI_FACE_TEXTURE_PREFIX}${pad2(faceIndex)}.png`;
}

function applyPixelTextureSettings(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function setLoadingProgress(text) {
  loadingProgressEl.textContent = text;
}

function showLoadingOverlay() {
  loadingOverlay.classList.remove("hidden");
}

function hideLoadingOverlay() {
  loadingOverlay.classList.add("hidden");
}

function makePlaceholderTexture() {
  const placeholderCanvas = document.createElement("canvas");
  placeholderCanvas.width = 2;
  placeholderCanvas.height = 2;
  const context = placeholderCanvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#08080c";
  context.fillRect(0, 0, 2, 2);
  context.fillStyle = "#1f1420";
  context.fillRect(0, 0, 1, 1);
  context.fillRect(1, 1, 1, 1);
  return applyPixelTextureSettings(new THREE.CanvasTexture(placeholderCanvas));
}

function idFromTriacontahedronHit(hit) {
  if (!hit.uv || !hit.object.userData) return null;

  const faceIndex = hit.object.userData.faceIndex;
  const slots = triFaceSlots[faceIndex];
  if (faceIndex < 0 || faceIndex >= TRI_FACE_COUNT || !slots) return null;

  const x = clamp(hit.uv.x * TRI_FACE_TEX_W, 0, TRI_FACE_TEX_W - 0.0001);
  const y = clamp((1 - hit.uv.y) * TRI_FACE_TEX_H, 0, TRI_FACE_TEX_H - 0.0001);
  let closest = null;
  let closestDistance = Infinity;

  for (let i = slots.length - 1; i >= 0; i -= 1) {
    const slot = slots[i];
    const inRect = slot.hitRect
      && x >= slot.hitRect.x
      && x <= slot.hitRect.x + slot.hitRect.w
      && y >= slot.hitRect.y
      && y <= slot.hitRect.y + slot.hitRect.h;

    if (inRect) {
      closest = slot;
      break;
    }

    const dx = x - slot.x;
    const dy = y - slot.y;
    const distance = dx * dx + dy * dy;
    if (distance < closestDistance) {
      closest = slot;
      closestDistance = distance;
    }
  }

  if (!closest) return null;
  const id = faceIndex * RHOMBUS_CAT_COUNT + closest.id;
  return id >= 0 && id <= MAX_ID ? id : null;
}

function updatePointerFromClient(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
}

function updatePreview(id) {
  if (id === null) {
    previewEl.style.backgroundPosition = "9999px 9999px";
    return;
  }

  if (hudUnlocked) {
    ensurePreviewAtlasLoaded();
  }

  const row = Math.floor(id / COLS);
  const col = id % COLS;
  previewEl.style.backgroundSize = `${ATLAS_W * PREVIEW_SCALE}px ${ATLAS_H * PREVIEW_SCALE}px`;
  previewEl.style.backgroundPosition = `${-(col * TILE_W * PREVIEW_SCALE)}px ${-(row * TILE_H * PREVIEW_SCALE)}px`;
}

function ensurePreviewAtlasLoaded() {
  if (previewAtlasLoaded || previewAtlasLoading) return;

  previewAtlasLoading = true;
  previewEl.style.backgroundImage = 'url("img/allcats.png")';
  previewAtlasLoaded = true;
  previewAtlasLoading = false;
}

function updateHudLockState() {
  hud.classList.toggle("locked", !hudUnlocked);
  hudLockButton.textContent = hudUnlocked ? "🔓" : "🔒";
  const label = hudUnlocked ? "Lock MoonCat details" : "Unlock MoonCat details";
  hudLockButton.setAttribute("aria-label", label);
  hudLockButton.title = label;
}

function clearTooltipHideTimer() {
  if (tooltipHideTimer !== null) {
    window.clearTimeout(tooltipHideTimer);
    tooltipHideTimer = null;
  }
}

function scheduleTooltipHide() {
  clearTooltipHideTimer();
  tooltipHideTimer = window.setTimeout(() => {
    tooltipEl.style.display = "none";
    tooltipHideTimer = null;
  }, TOOLTIP_INACTIVITY_HIDE_MS);
}

function setHoveredId(id) {
  hoveredId = id;
  catIdEl.textContent = id === null ? "-" : String(id);
  updatePreview(id);

  if (id === null) {
    clearTooltipHideTimer();
    tooltipEl.style.display = "none";
    return;
  }

  tooltipEl.textContent = `MoonCat ${id}`;
  tooltipEl.style.left = `${lastClientX + 14}px`;
  tooltipEl.style.top = `${lastClientY + 14}px`;
  tooltipEl.style.display = "block";
  scheduleTooltipHide();
}

function updateHoverFromPointer() {
  if (!activeObject || !pointerInside) {
    setHoveredId(null);
    return;
  }

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(activeObject, true);
  let id = null;

  if (hits.length) {
    id = idFromTriacontahedronHit(hits[0]);
  }

  setHoveredId(id);
}

function openCat(id) {
  if (!hudUnlocked) return;
  if (id === null) return;
  window.open(`https://mooncatrescue.com/mooncats/${id}`, "_blank", "noopener,noreferrer");
}

function canRollActiveObject() {
  return Boolean(activeObject);
}

function rollActiveObject(delta) {
  if (!canRollActiveObject()) return;
  const axis = new THREE.Vector3();
  camera.getWorldDirection(axis);
  activeObject.rotateOnWorldAxis(axis.normalize(), delta);
}

function pointerAngleFromActiveTouches() {
  const touches = Array.from(activePointers.values()).filter((pointerInfo) => pointerInfo.pointerType === "touch");
  if (touches.length !== 2) return null;
  return Math.atan2(touches[1].y - touches[0].y, touches[1].x - touches[0].x);
}

function updateTouchTwistRoll() {
  const angle = pointerAngleFromActiveTouches();
  if (angle === null) {
    twoFingerLastAngle = null;
    return;
  }

  touchGestureWasTwoFinger = true;
  if (twoFingerLastAngle !== null) {
    let delta = angle - twoFingerLastAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    rollActiveObject(delta * TOUCH_TWIST_ROLL_SPEED);
  }

  twoFingerLastAngle = angle;
}

function pauseAutoRotate() {
  autoRotateResumeAt = Infinity;
}

function scheduleAutoRotateResume() {
  autoRotateResumeAt = performance.now() + AUTO_ROTATE_RESUME_DELAY_MS;
  autoRotateActiveSince = autoRotateResumeAt;
}

function startAutoRotateNow() {
  autoRotateResumeAt = performance.now();
  autoRotateActiveSince = autoRotateResumeAt;
}

function applyAutoRotate(deltaSeconds) {
  if (!AUTO_ROTATE_ENABLED || !activeObject) return;
  const now = performance.now();
  if (now < autoRotateResumeAt) return;

  const t = clamp((now - autoRotateActiveSince) / AUTO_ROTATE_EASE_IN_MS, 0, 1);
  const ease = 1 - Math.pow(1 - t, 3);
  activeObject.rotation.x += AUTO_ROTATE_SPEED_X * deltaSeconds * ease;
  activeObject.rotation.y += AUTO_ROTATE_SPEED_Y * deltaSeconds * ease;
  activeObject.rotation.z += AUTO_ROTATE_SPEED_Z * deltaSeconds * ease;
}

function updateStarParallax() {
  if (!STAR_PARALLAX_ENABLED || !activeObject) return;

  parallaxCameraVector.copy(camera.position).normalize();
  const targetX = -parallaxCameraVector.x * STAR_PARALLAX_SMALL_STRENGTH;
  const targetY = parallaxCameraVector.y * STAR_PARALLAX_SMALL_STRENGTH;
  const largeTargetX = -parallaxCameraVector.x * STAR_PARALLAX_LARGE_STRENGTH;
  const largeTargetY = parallaxCameraVector.y * STAR_PARALLAX_LARGE_STRENGTH;

  starParallax.smallX += (targetX - starParallax.smallX) * STAR_PARALLAX_EASE;
  starParallax.smallY += (targetY - starParallax.smallY) * STAR_PARALLAX_EASE;
  starParallax.largeX += (largeTargetX - starParallax.largeX) * STAR_PARALLAX_EASE;
  starParallax.largeY += (largeTargetY - starParallax.largeY) * STAR_PARALLAX_EASE;

  smallStarsEl.style.transform = `translate3d(${starParallax.smallX}px, ${starParallax.smallY}px, 0)`;
  largeStarsEl.style.transform = `translate3d(${starParallax.largeX}px, ${starParallax.largeY}px, 0)`;
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  controls.handleResize?.();
  updateHoverFromPointer();
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  controls.update();
  applyAutoRotate(deltaSeconds);
  updateStarParallax();
  renderer.render(scene, camera);
}

function makeIcosahedronData() {
  const p = PHI;
  const vertices = [
    [-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0],
    [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p],
    [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1]
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z).normalize());

  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  return { vertices, faces };
}

function edgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function makeRhombicTriacontahedronFaces() {
  const { vertices, faces } = makeIcosahedronData();
  const edgeMap = new Map();
  const vertexNeighbors = Array.from({ length: vertices.length }, () => new Set());

  faces.forEach((face, faceIndex) => {
    for (let i = 0; i < 3; i += 1) {
      const a = face[i];
      const b = face[(i + 1) % 3];
      const key = edgeKey(a, b);
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { a: Math.min(a, b), b: Math.max(a, b), faces: [] });
      }
      edgeMap.get(key).faces.push(faceIndex);
      vertexNeighbors[a].add(b);
      vertexNeighbors[b].add(a);
    }
  });

  const vertexDuals = vertices.map((vertex, index) => {
    const neighborIndex = vertexNeighbors[index].values().next().value;
    const planeDistance = vertex.dot(vertices[neighborIndex].clone().add(vertex).multiplyScalar(0.5));
    return vertex.clone().multiplyScalar(1 / planeDistance);
  });

  const faceDuals = faces.map((face) => {
    const a = vertices[face[0]];
    const b = vertices[face[1]];
    const c = vertices[face[2]];
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (normal.dot(centroid) < 0) normal.multiplyScalar(-1);
    const planeDistance = normal.dot(a);
    return normal.multiplyScalar(1 / planeDistance);
  });

  return Array.from(edgeMap.values()).map((edge) => {
    const [faceA, faceB] = edge.faces;
    console.assert(edge.faces.length === 2, `Icosahedron edge ${edge.a}-${edge.b} has ${edge.faces.length} adjacent faces`);
    return [
      vertexDuals[edge.a].clone(),
      faceDuals[faceA].clone(),
      vertexDuals[edge.b].clone(),
      faceDuals[faceB].clone()
    ];
  });
}

function sortFaceVertices(points) {
  const center = points.reduce((acc, point) => acc.add(point), new THREE.Vector3()).multiplyScalar(1 / points.length);
  const normal = center.clone().normalize();
  const basisX = points[0].clone().sub(center).normalize();
  const basisY = normal.clone().cross(basisX).normalize();

  const sorted = [...points].sort((a, b) => {
    const av = a.clone().sub(center);
    const bv = b.clone().sub(center);
    const aa = Math.atan2(av.dot(basisY), av.dot(basisX));
    const ba = Math.atan2(bv.dot(basisY), bv.dot(basisX));
    return aa - ba;
  });

  const faceNormal = sorted[1].clone().sub(sorted[0]).cross(sorted[2].clone().sub(sorted[0]));
  if (faceNormal.dot(center) < 0) sorted.reverse();
  return sorted;
}

function orderRhombusFaceVerticesForDiamondUv(points) {
  const sorted = sortFaceVertices(points);
  const center = sorted.reduce((acc, point) => acc.add(point), new THREE.Vector3()).multiplyScalar(1 / sorted.length);
  const diagonalA = sorted[0].distanceTo(sorted[2]);
  const diagonalB = sorted[1].distanceTo(sorted[3]);
  const longPair = diagonalA >= diagonalB ? [sorted[0], sorted[2]] : [sorted[1], sorted[3]];
  const shortPair = diagonalA >= diagonalB ? [sorted[1], sorted[3]] : [sorted[0], sorted[2]];
  const normal = sorted[1].clone().sub(sorted[0]).cross(sorted[2].clone().sub(sorted[0])).normalize();
  if (normal.dot(center) < 0) normal.multiplyScalar(-1);

  let localUp = new THREE.Vector3(0, 1, 0).projectOnPlane(normal);
  if (localUp.lengthSq() < 0.000001) {
    localUp = new THREE.Vector3(0, 0, 1).projectOnPlane(normal);
  }
  localUp.normalize();
  const localRight = localUp.clone().cross(normal).normalize();

  const [top, bottom] = longPair[0].clone().sub(center).dot(localUp) >= longPair[1].clone().sub(center).dot(localUp)
    ? [longPair[0], longPair[1]]
    : [longPair[1], longPair[0]];
  const [right, left] = shortPair[0].clone().sub(center).dot(localRight) >= shortPair[1].clone().sub(center).dot(localRight)
    ? [shortPair[0], shortPair[1]]
    : [shortPair[1], shortPair[0]];

  return [top, right, bottom, left];
}

function makeTriFaceMaterial(faceIndex) {
  const material = new THREE.MeshBasicMaterial({
    map: makePlaceholderTexture(),
    side: THREE.DoubleSide
  });

  const ready = new Promise((resolve, reject) => {
    const url = triFaceTextureUrl(faceIndex);
    textureLoader.load(
      url,
      (texture) => {
        if (texture.image.width !== TRI_FACE_TEX_W || texture.image.height !== TRI_FACE_TEX_H) {
          console.warn(`${url} is ${texture.image.width}x${texture.image.height}; expected ${TRI_FACE_TEX_W}x${TRI_FACE_TEX_H}. Regenerate production tri-face PNGs from the dev tool.`);
        }
        applyPixelTextureSettings(texture);
        material.map = texture;
        material.needsUpdate = true;
        triTextureStats.prerenderedLoaded += 1;
        resolve();
      },
      undefined,
      () => {
        triTextureStats.textureErrors += 1;
        reject(new Error(`Missing required tri-face texture: ${url}`));
      }
    );
  });

  return { material, ready };
}

function makeTriacontahedron() {
  const group = new THREE.Group();
  const faces = makeRhombicTriacontahedronFaces();
  const uvs = [
    0.5, 1,
    1, 0.5,
    0.5, 0,
    0, 0.5
  ];

  console.assert(faces.length === TRI_FACE_COUNT, `Expected ${TRI_FACE_COUNT} triacontahedron faces, got ${faces.length}`);
  console.assert(TRI_FACE_COUNT * RHOMBUS_CAT_COUNT === MAX_ID + 1, "Triacontahedron face count does not cover the full atlas exactly once");

  faces.forEach((points, faceIndex) => {
    console.assert(points.length === 4, `Face ${faceIndex} does not have 4 vertices`);
    const sorted = orderRhombusFaceVerticesForDiamondUv(points);
    const positions = [];
    for (const point of sorted) {
      positions.push(point.x, point.y, point.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();

    const { material, ready } = makeTriFaceMaterial(faceIndex);
    triFaceTexturePromises.push(ready);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.faceIndex = faceIndex;
    group.add(mesh);
  });

  group.scale.setScalar(0.62);
  group.visible = false;
  console.info(`Triacontahedron: ${group.children.length} faces x ${RHOMBUS_CAT_COUNT} cats = ${group.children.length * RHOMBUS_CAT_COUNT}`);
  return group;
}

function validateCompactTriFaceSlotMetadata(metadata) {
  if (!metadata || metadata.v !== 1) return false;
  if (metadata.tw !== TRI_FACE_TEX_W) return false;
  if (metadata.th !== TRI_FACE_TEX_H) return false;
  if (metadata.fc !== TRI_FACE_COUNT) return false;
  if (metadata.cpf !== RHOMBUS_CAT_COUNT) return false;
  if (!Array.isArray(metadata.faces) || metadata.faces.length !== TRI_FACE_COUNT) return false;

  return metadata.faces.every((faceSlots) => (
    Array.isArray(faceSlots)
    && faceSlots.length === RHOMBUS_CAT_COUNT
    && faceSlots.every((slotTuple) => (
      Array.isArray(slotTuple)
      && slotTuple.length === 7
      && slotTuple.every(Number.isFinite)
    ))
  ));
}

function normalizeCompactTriFaceSlots(faceSlots) {
  return faceSlots.map(([id, hitX, hitY, hitW, hitH, centerX, centerY]) => ({
    id,
    x: centerX,
    y: centerY,
    w: hitW,
    h: hitH,
    polygon: null,
    hitRect: {
      x: hitX,
      y: hitY,
      w: hitW,
      h: hitH
    }
  }));
}

async function loadTriFaceSlotMetadata() {
  const response = await fetch(TRI_FACE_METADATA_URL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Missing required tri-face slot metadata: ${TRI_FACE_METADATA_URL}`);
  }

  const metadata = await response.json();
  if (!validateCompactTriFaceSlotMetadata(metadata)) {
    throw new Error(`${TRI_FACE_METADATA_URL} does not match current CatMoon texture settings.`);
  }

  metadata.faces.forEach((faceSlots, faceIndex) => {
    triFaceSlots[faceIndex] = normalizeCompactTriFaceSlots(faceSlots);
  });
  triTextureStats.metadataLoaded = true;
  console.info(`Loaded tri-face slot metadata from ${TRI_FACE_METADATA_URL}`);
}

window.triFaceTextureStats = triTextureStats;

async function initializeScene() {
  showLoadingOverlay();
  setLoadingProgress("Loading face metadata...");
  await loadTriFaceSlotMetadata();

  setLoadingProgress("Building CatMoon...");
  triFaceTexturePromises.length = 0;
  triacontahedron = makeTriacontahedron();
  triacontahedron.visible = false;
  scene.add(triacontahedron);
  let readyFaceCount = 0;
  triacontahedron.userData.textureReadyPromise = Promise.all(
    triFaceTexturePromises.map((promise) => (
      promise.then(() => {
        readyFaceCount += 1;
        setLoadingProgress(`Loading face textures ${readyFaceCount}/${TRI_FACE_COUNT}`);
      })
    ))
  );

  setLoadingProgress(`Loading face textures 0/${TRI_FACE_COUNT}`);
  await triacontahedron.userData.textureReadyPromise;
  console.info(`Tri face textures ready: ${triTextureStats.prerenderedLoaded} PNG.`);

  resize();
  activeObject = triacontahedron;
  controls.enabled = true;
  controls.minDistance = TRI_MIN_DISTANCE;
  controls.maxDistance = TRI_MAX_DISTANCE;
  statusEl.textContent = `Drag to tumble, scroll/pinch zoom, twist or Ctrl/Alt-drag roll.`;
  setHoveredId(null);
  updateHoverFromPointer();
  triacontahedron.visible = true;
  startAutoRotateNow();
  hideLoadingOverlay();
  if (!animationStarted) {
    animationStarted = true;
    animate();
  }
}

initializeScene().catch((error) => {
  console.error("Could not initialize CatMoon scene.", error);
  setLoadingProgress(error.message || "Could not initialize CatMoon scene.");
  statusEl.textContent = "Could not initialize CatMoon scene.";
});

hudLockButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  hudUnlocked = !hudUnlocked;
  updateHudLockState();
  if (hudUnlocked) {
    ensurePreviewAtlasLoaded();
    setHoveredId(hoveredId);
  }
});
updateHudLockState();

renderer.domElement.addEventListener("pointermove", (event) => {
  if (activePointers.has(event.pointerId)) {
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType
    });
  }

  if (rollDrag) {
    const dx = event.clientX - rollDrag.x;
    rollActiveObject(dx * DESKTOP_ROLL_DRAG_SPEED);
    rollDrag.x = event.clientX;
    rollDrag.y = event.clientY;
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  updateTouchTwistRoll();

  pointerInside = true;
  lastClientX = event.clientX;
  lastClientY = event.clientY;
  updatePointerFromClient(event.clientX, event.clientY);
  updateHoverFromPointer();
}, { capture: true });

renderer.domElement.addEventListener("pointerleave", () => {
  pointerInside = false;
  setHoveredId(null);
});

renderer.domElement.addEventListener("pointerdown", (event) => {
  pauseAutoRotate();
  activePointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
    pointerType: event.pointerType
  });

  if ((event.ctrlKey || event.altKey) && canRollActiveObject()) {
    rollDrag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
    controls.enabled = false;
    renderer.domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  downPoint = {
    x: event.clientX,
    y: event.clientY
  };
}, { capture: true });

renderer.domElement.addEventListener("pointerup", (event) => {
  activePointers.delete(event.pointerId);
  updateTouchTwistRoll();

  if (touchGestureWasTwoFinger && event.pointerType === "touch") {
    if (activePointers.size < 2) {
      touchGestureWasTwoFinger = false;
    }
    downPoint = null;
    scheduleAutoRotateResume();
    return;
  }

  if (rollDrag && rollDrag.pointerId === event.pointerId) {
    rollDrag = null;
    controls.enabled = true;
    renderer.domElement.releasePointerCapture?.(event.pointerId);
    downPoint = null;
    event.preventDefault();
    event.stopImmediatePropagation();
    scheduleAutoRotateResume();
    return;
  }

  if (!downPoint) return;

  const dx = event.clientX - downPoint.x;
  const dy = event.clientY - downPoint.y;
  const moved = Math.hypot(dx, dy);

  lastClientX = event.clientX;
  lastClientY = event.clientY;
  updatePointerFromClient(event.clientX, event.clientY);
  updateHoverFromPointer();

  if (moved <= CLICK_MOVE_LIMIT) {
    openCat(hoveredId);
  }

  downPoint = null;
  scheduleAutoRotateResume();
}, { capture: true });

renderer.domElement.addEventListener("pointercancel", (event) => {
  activePointers.delete(event.pointerId);
  twoFingerLastAngle = null;
  touchGestureWasTwoFinger = false;
  if (rollDrag && rollDrag.pointerId === event.pointerId) {
    rollDrag = null;
    controls.enabled = true;
  }
  downPoint = null;
  scheduleAutoRotateResume();
}, { capture: true });

window.addEventListener("resize", resize);
resize();
