import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";

const COLS = 160;
const ROWS = 159;
const TILE_W = 21;
const TILE_H = 22;
const ATLAS_W = COLS * TILE_W;
const ATLAS_H = ROWS * TILE_H;
const MAX_ID = COLS * ROWS - 1;
const ALL_CATS_ATLAS_URL = "img/allcats.png";
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
const FILTER_DATA_URL = "data/mooncat-filters.json";
const FILTER_TEXTURE_DIR = "img/filters";
const FILTER_MANIFEST_URL = `${FILTER_TEXTURE_DIR}/filter-manifest.json`;
const FILTER_BASE_OPACITY = 0.16;
const WALLET_FILTER_KEY = "wallet";
const WALLET_FILTER_LABEL = "Wallet Cats";
const CHARACTER_CATEGORY_KEYS = [
  "garfield",
  "cheshire",
  "pinkpanther",
  "alien",
  "zombie",
  "simba",
  "golden",
  "pikachu"
];
const FILTER_DEFINITIONS = [
  { key: "genesis", category: "genesis" },
  { key: "characters", categories: CHARACTER_CATEGORY_KEYS },
  { key: "day1", category: "day1" },
  { key: "week1", category: "week1" },
  { key: "2017", category: "2017" },
  { key: "2018", category: "2018" },
  { key: "2019", category: "2019" },
  { key: "2020", category: "2020" },
  { key: "earlyRescues", category: "earlyRescues" },
  { key: "2021", category: "2021" }
];
const FILTER_KEYS = new Set(FILTER_DEFINITIONS.map((filter) => filter.key));
const PRELOAD_FILTER_KEYS = FILTER_DEFINITIONS.map((filter) => filter.key);
const TOUCH_TWIST_ROLL_SPEED = 1.0;
const DESKTOP_ROLL_DRAG_SPEED = 0.006;
const AUTO_ROTATE_ENABLED = true;
const AUTO_ROTATE_SPEED_X = 0.035;
const AUTO_ROTATE_SPEED_Y = 0.055;
const AUTO_ROTATE_SPEED_Z = 0.01;
const AUTO_ROTATE_RESUME_DELAY_MS = 5000;
const AUTO_ROTATE_EASE_IN_MS = 1000;
const FILTER_FOCUS_DURATION_MS = 1250;
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
const catFilterEl = document.getElementById("catFilter");
const walletFilterInputEl = document.getElementById("walletFilterInput");
const walletFilterButtonEl = document.getElementById("walletFilterButton");
const walletFilterStatusEl = document.getElementById("walletFilterStatus");
const activeFilterBadgeEl = document.getElementById("activeFilterBadge");
const activeFilterNameEl = document.getElementById("activeFilterName");
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
let activeFilter = "all";
let activeFilterSet = null;
let walletFilterInput = "";
let walletFilterIds = [];
let filterDataPromise = null;
let filterManifestPromise = null;
let filterSelectionToken = 0;
let filterOverlayPreloadStarted = false;
let allCatsAtlasImage = null;
let allCatsAtlasPromise = null;
let tooltipHideTimer = null;
let pointerInside = false;
let lastClientX = 0;
let lastClientY = 0;
let downPoint = null;
const triFaceSlots = [];
const triFaceTexturePromises = [];
const filterTexturePromises = new Map();
const filterTextureCache = new Map();
const triTextureStats = {
  prerenderedLoaded: 0,
  metadataLoaded: false,
  textureErrors: 0
};
const activePointers = new Map();
let twoFingerLastAngle = null;
let touchGestureWasTwoFinger = false;
let rollDrag = null;
let focusAnimation = null;
let focusInteractionVersion = 0;
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

function filterTextureUrl(filterKey, faceIndex) {
  return `${FILTER_TEXTURE_DIR}/${filterKey}/${TRI_FACE_TEXTURE_PREFIX}${pad2(faceIndex)}.png`;
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

function categoryIdSet(filters, key) {
  const ids = filters.categories?.[key]?.ids;
  if (!Array.isArray(ids)) {
    throw new Error(`${FILTER_DATA_URL} is missing categories.${key}.ids`);
  }
  return new Set(ids);
}

function unionCategoryIdSet(filters, keys) {
  const ids = new Set();
  for (const key of keys) {
    for (const id of categoryIdSet(filters, key)) {
      ids.add(id);
    }
  }
  return ids;
}

function filterDefinitionIdSet(filters, definition) {
  if (definition.key === "characters" && Array.isArray(filters.presets?.characters?.ids)) {
    return new Set(filters.presets.characters.ids);
  }
  if (definition.category) {
    return categoryIdSet(filters, definition.category);
  }
  return unionCategoryIdSet(filters, definition.categories);
}

async function loadFilterData() {
  const response = await fetch(FILTER_DATA_URL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Missing MoonCat filter data: ${FILTER_DATA_URL}`);
  }

  const filters = await response.json();
  const filterSets = {};
  for (const definition of FILTER_DEFINITIONS) {
    filterSets[definition.key] = filterDefinitionIdSet(filters, definition);
  }
  return filterSets;
}

function ensureFilterDataLoaded() {
  if (!filterDataPromise) {
    filterDataPromise = loadFilterData();
  }
  return filterDataPromise;
}

function validateFilterManifest(manifest) {
  return manifest
    && manifest.version === 1
    && manifest.filters
    && typeof manifest.filters === "object";
}

async function loadFilterManifest() {
  try {
    const response = await fetch(FILTER_MANIFEST_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest = await response.json();
    if (!validateFilterManifest(manifest)) {
      throw new Error(`${FILTER_MANIFEST_URL} is not a recognized filter manifest.`);
    }

    return manifest;
  } catch (error) {
    console.warn(`Could not load ${FILTER_MANIFEST_URL}; falling back to all filter overlay faces.`, error);
    return null;
  }
}

function ensureFilterManifestLoaded() {
  if (!filterManifestPromise) {
    filterManifestPromise = loadFilterManifest();
  }
  return filterManifestPromise;
}

function filterManifestFaces(manifest, filterKey) {
  const faces = manifest?.filters?.[filterKey]?.faces;
  if (!Array.isArray(faces)) {
    if (manifest) {
      console.warn(`${FILTER_MANIFEST_URL} is missing filters.${filterKey}.faces; falling back to all faces for that filter.`);
    }
    return Array.from({ length: TRI_FACE_COUNT }, (_, faceIndex) => faceIndex);
  }

  return faces.filter((faceIndex) => (
    Number.isInteger(faceIndex)
    && faceIndex >= 0
    && faceIndex < TRI_FACE_COUNT
  ));
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
  const isFiltered = activeFilterSet !== null;

  for (let i = slots.length - 1; i >= 0; i -= 1) {
    const slot = slots[i];
    const globalId = faceIndex * RHOMBUS_CAT_COUNT + slot.id;
    if (isFiltered && !activeFilterSet.has(globalId)) {
      continue;
    }

    const inRect = slot.hitRect
      && x >= slot.hitRect.x
      && x <= slot.hitRect.x + slot.hitRect.w
      && y >= slot.hitRect.y
      && y <= slot.hitRect.y + slot.hitRect.h;

    if (inRect) {
      closest = slot;
      break;
    }

    if (isFiltered) {
      continue;
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

  if (!allCatsAtlasImage) {
    previewEl.style.backgroundPosition = "9999px 9999px";
    return;
  }

  const row = Math.floor(id / COLS);
  const col = id % COLS;
  previewEl.style.backgroundSize = `${ATLAS_W * PREVIEW_SCALE}px ${ATLAS_H * PREVIEW_SCALE}px`;
  previewEl.style.backgroundPosition = `${-(col * TILE_W * PREVIEW_SCALE)}px ${-(row * TILE_H * PREVIEW_SCALE)}px`;
}

function applyCachedPreviewAtlas() {
  if (!allCatsAtlasImage) return;

  previewEl.style.backgroundImage = `url("${ALL_CATS_ATLAS_URL}")`;
  updatePreview(hoveredId);
}

function loadAllCatsAtlas() {
  if (allCatsAtlasImage) {
    return Promise.resolve(allCatsAtlasImage);
  }
  if (!allCatsAtlasPromise) {
    allCatsAtlasPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth !== ATLAS_W || image.naturalHeight !== ATLAS_H) {
          reject(new Error(`${ALL_CATS_ATLAS_URL} is ${image.naturalWidth}x${image.naturalHeight}; expected ${ATLAS_W}x${ATLAS_H}.`));
          return;
        }
        allCatsAtlasImage = image;
        applyCachedPreviewAtlas();
        resolve(image);
      };
      image.onerror = () => reject(new Error(`Could not load ${ALL_CATS_ATLAS_URL}.`));
      image.src = ALL_CATS_ATLAS_URL;
    }).catch((error) => {
      allCatsAtlasPromise = null;
      throw error;
    });
  }
  return allCatsAtlasPromise;
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

function cancelFocusAnimation() {
  focusAnimation = null;
}

function focusFace(faceIndex) {
  if (!triacontahedron || activePointers.size || rollDrag) return;

  const faceNormal = triacontahedron.userData.faceNormals?.[faceIndex];
  const faceUp = triacontahedron.userData.faceUps?.[faceIndex];
  if (!faceNormal || !faceUp) return;

  const desiredNormal = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1).normalize();
  const targetUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).projectOnPlane(desiredNormal);
  if (targetUp.lengthSq() < 0.000001) {
    targetUp.set(0, 1, 0).projectOnPlane(desiredNormal);
  }
  if (targetUp.lengthSq() < 0.000001) {
    targetUp.set(0, 0, 1).projectOnPlane(desiredNormal);
  }
  targetUp.normalize();

  const faceRight = faceUp.clone().cross(faceNormal).normalize();
  if (!Number.isFinite(faceRight.lengthSq()) || faceRight.lengthSq() < 0.000001) return;

  const desiredRight = targetUp.clone().cross(desiredNormal).normalize();
  if (!Number.isFinite(desiredRight.lengthSq()) || desiredRight.lengthSq() < 0.000001) return;

  const canonicalBasis = new THREE.Matrix4().makeBasis(faceRight, faceUp, faceNormal);
  const targetBasis = new THREE.Matrix4().makeBasis(desiredRight, targetUp, desiredNormal);
  const canonicalQuaternion = new THREE.Quaternion().setFromRotationMatrix(canonicalBasis);
  const targetBasisQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetBasis);
  const targetQuaternion = targetBasisQuaternion.multiply(canonicalQuaternion.invert()).normalize();

  focusAnimation = {
    startTime: performance.now(),
    duration: FILTER_FOCUS_DURATION_MS,
    startQuaternion: triacontahedron.quaternion.clone(),
    targetQuaternion
  };
  pauseAutoRotate();
}

async function focusFilterFace(filterKey, token, interactionVersion) {
  try {
    const manifest = await ensureFilterManifestLoaded();
    if (token !== filterSelectionToken) return;
    if (interactionVersion !== focusInteractionVersion) return;

    const faces = manifest?.filters?.[filterKey]?.faces;
    if (!Array.isArray(faces) || faces.length === 0) return;

    focusFace(faces[0]);
  } catch (error) {
    console.warn(`Could not focus CatMoon filter face for ${filterKey}.`, error);
  }
}

function updateFocusAnimation(now) {
  if (!focusAnimation || !triacontahedron) return;

  const t = clamp((now - focusAnimation.startTime) / focusAnimation.duration, 0, 1);
  const eased = 1 - Math.pow(1 - t, 3);
  triacontahedron.quaternion.copy(focusAnimation.startQuaternion).slerp(focusAnimation.targetQuaternion, eased);

  if (t >= 1) {
    focusAnimation = null;
    scheduleAutoRotateResume();
  }
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
  updateFocusAnimation(now);
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
    side: THREE.DoubleSide,
    opacity: 1
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

function makeFilterOverlayMaterial() {
  return new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
}

function makeFilterBackingMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    transparent: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}

function makeFilterEdgeMaterial() {
  return new THREE.LineBasicMaterial({
    color: 0xff69b4,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  });
}

function loadFilterTexture(filterKey, faceIndex) {
  return new Promise((resolve, reject) => {
    const url = filterTextureUrl(filterKey, faceIndex);
    textureLoader.load(
      url,
      (texture) => {
        if (texture.image.width !== TRI_FACE_TEX_W || texture.image.height !== TRI_FACE_TEX_H) {
          console.warn(`${url} is ${texture.image.width}x${texture.image.height}; expected ${TRI_FACE_TEX_W}x${TRI_FACE_TEX_H}. Regenerate filter overlay PNGs from the tools script.`);
        }
        resolve(applyPixelTextureSettings(texture));
      },
      undefined,
      () => reject(new Error(`Could not load filter overlay texture: ${url}`))
    );
  });
}

async function ensureFilterTexturesLoaded(filterKey) {
  if (filterTextureCache.has(filterKey)) {
    return filterTextureCache.get(filterKey);
  }

  if (!filterTexturePromises.has(filterKey)) {
    const promise = ensureFilterManifestLoaded().then((manifest) => {
      const faceIndices = filterManifestFaces(manifest, filterKey);
      const textures = Array(TRI_FACE_COUNT).fill(null);
      return Promise.all(
        faceIndices.map((faceIndex) => (
          loadFilterTexture(filterKey, faceIndex).then((texture) => {
            textures[faceIndex] = texture;
          })
        ))
      ).then(() => textures);
    }).then((textures) => {
      filterTextureCache.set(filterKey, textures);
      return textures;
    });
    filterTexturePromises.set(filterKey, promise);
  }

  return filterTexturePromises.get(filterKey);
}

function preloadFilterOverlayTextures() {
  if (filterOverlayPreloadStarted) return;
  filterOverlayPreloadStarted = true;

  for (const filterKey of PRELOAD_FILTER_KEYS) {
    ensureFilterTexturesLoaded(filterKey).catch((error) => {
      console.warn(`Could not preload ${filterKey} CatMoon filter overlays.`, error);
    });
  }
}

function disposeTexture(texture) {
  if (!texture) return;
  texture.dispose();
}

function clearWalletOverlayTextures() {
  const textures = filterTextureCache.get(WALLET_FILTER_KEY);
  if (!textures) return;

  for (const texture of textures) {
    disposeTexture(texture);
  }
  filterTextureCache.delete(WALLET_FILTER_KEY);
}

function normalizeWalletMoonCatIds(ids) {
  if (!Array.isArray(ids)) {
    throw new Error("Wallet lookup response did not include an ids array.");
  }

  return Array.from(new Set(ids.filter((id) => (
    Number.isInteger(id)
    && id >= 0
    && id <= MAX_ID
  )))).sort((a, b) => a - b);
}

async function lookupWalletMoonCats(input) {
  const response = await fetch(`/api/wallet-cats?address=${encodeURIComponent(input)}`, {
    headers: {
      Accept: "application/json"
    }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    if (response.ok) {
      throw new Error("Wallet lookup response was not valid JSON.");
    }
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Wallet lookup failed with HTTP ${response.status}.`);
  }

  return normalizeWalletMoonCatIds(payload?.ids);
}

function setWalletFilterStatus(message, isError = false) {
  walletFilterStatusEl.textContent = message;
  walletFilterStatusEl.classList.toggle("error", isError);
}

function clearWalletFilterState({ clearStatus = true } = {}) {
  walletFilterInput = "";
  walletFilterIds = [];
  clearWalletOverlayTextures();
  if (clearStatus) {
    setWalletFilterStatus("");
  }
}

function drawCatFromAtlas(context, atlasImage, id, destRect) {
  const srcCol = id % COLS;
  const srcRow = Math.floor(id / COLS);
  context.drawImage(
    atlasImage,
    srcCol * TILE_W,
    srcRow * TILE_H,
    TILE_W,
    TILE_H,
    Math.round(destRect.x),
    Math.round(destRect.y),
    Math.round(destRect.w),
    Math.round(destRect.h)
  );
}

function groupWalletIdsByFace(ids) {
  const idsByFace = new Map();
  for (const id of ids) {
    const faceIndex = Math.floor(id / RHOMBUS_CAT_COUNT);
    if (faceIndex < 0 || faceIndex >= TRI_FACE_COUNT) continue;

    const slotId = id % RHOMBUS_CAT_COUNT;
    if (!idsByFace.has(faceIndex)) {
      idsByFace.set(faceIndex, new Set());
    }
    idsByFace.get(faceIndex).add(slotId);
  }
  return idsByFace;
}

function makeWalletOverlayTexture(atlasImage, faceIndex, slotIds) {
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = TRI_FACE_TEX_W;
  faceCanvas.height = TRI_FACE_TEX_H;

  const context = faceCanvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, faceCanvas.width, faceCanvas.height);

  const slots = triFaceSlots[faceIndex] || [];
  for (const slot of slots) {
    if (!slotIds.has(slot.id) || !slot.hitRect) continue;
    drawCatFromAtlas(context, atlasImage, faceIndex * RHOMBUS_CAT_COUNT + slot.id, slot.hitRect);
  }

  return applyPixelTextureSettings(new THREE.CanvasTexture(faceCanvas));
}

function makeWalletOverlayTextures(atlasImage, ids) {
  const textures = Array(TRI_FACE_COUNT).fill(null);
  const idsByFace = groupWalletIdsByFace(ids);

  for (const [faceIndex, slotIds] of idsByFace) {
    if (!slotIds.size) continue;
    textures[faceIndex] = makeWalletOverlayTexture(atlasImage, faceIndex, slotIds);
  }

  return textures;
}

function filterDisplayName(filterKey) {
  if (filterKey === WALLET_FILTER_KEY) {
    return WALLET_FILTER_LABEL;
  }
  const option = Array.from(catFilterEl.options).find((item) => item.value === filterKey);
  return option?.textContent?.trim() || filterKey;
}

function updateActiveFilterBadge() {
  const isFiltered = activeFilter !== "all";
  activeFilterBadgeEl.hidden = !isFiltered;
  if (isFiltered) {
    activeFilterNameEl.textContent = filterDisplayName(activeFilter);
    activeFilterBadgeEl.setAttribute("aria-label", `${filterDisplayName(activeFilter)} active. Reset filter.`);
    activeFilterBadgeEl.title = `Reset ${filterDisplayName(activeFilter)}`;
  } else {
    activeFilterNameEl.textContent = "";
    activeFilterBadgeEl.removeAttribute("aria-label");
    activeFilterBadgeEl.removeAttribute("title");
  }
}

function updateFilterAppearance() {
  updateActiveFilterBadge();
  if (!triacontahedron?.userData) return;

  const isFiltered = activeFilter !== "all";
  const overlayTextures = filterTextureCache.get(activeFilter);
  const overlaysReady = isFiltered && overlayTextures;

  for (const mesh of triacontahedron.userData.baseMeshes || []) {
    mesh.material.transparent = isFiltered;
    mesh.material.opacity = isFiltered ? FILTER_BASE_OPACITY : 1;
    mesh.material.needsUpdate = true;
  }

  for (const mesh of triacontahedron.userData.backingMeshes || []) {
    mesh.visible = isFiltered;
  }

  for (const mesh of triacontahedron.userData.edgeMeshes || []) {
    mesh.visible = isFiltered;
  }

  (triacontahedron.userData.overlayMeshes || []).forEach((mesh, faceIndex) => {
    if (!overlaysReady) {
      mesh.visible = false;
      return;
    }

    const texture = overlayTextures[faceIndex];
    if (!texture) {
      mesh.visible = false;
      return;
    }

    mesh.material.map = texture;
    mesh.material.opacity = 1;
    mesh.material.needsUpdate = true;
    mesh.visible = true;
  });
}

async function setActiveFilter(filterKey, { focus = false } = {}) {
  const nextFilter = FILTER_KEYS.has(filterKey) ? filterKey : "all";
  const token = filterSelectionToken + 1;
  filterSelectionToken = token;
  clearWalletFilterState();
  updateFilterAppearance();

  if (nextFilter === "all") {
    activeFilter = "all";
    activeFilterSet = null;
    catFilterEl.value = "all";
    updateFilterAppearance();
    updateHoverFromPointer();
    return;
  }

  try {
    const filterSets = await ensureFilterDataLoaded();
    if (token !== filterSelectionToken) return;

    activeFilter = nextFilter;
    activeFilterSet = filterSets[nextFilter];
    updateFilterAppearance();
    updateHoverFromPointer();
    if (focus) {
      focusFilterFace(nextFilter, token, focusInteractionVersion);
    }

    await ensureFilterTexturesLoaded(nextFilter);
    if (token !== filterSelectionToken) return;

    updateFilterAppearance();
    updateHoverFromPointer();
  } catch (error) {
    if (token !== filterSelectionToken) return;
    console.warn(`Could not apply ${nextFilter} CatMoon filter.`, error);
    activeFilter = "all";
    activeFilterSet = null;
    catFilterEl.value = "all";
    updateFilterAppearance();
    updateHoverFromPointer();
  }
}

async function applyWalletFilter() {
  const input = walletFilterInputEl.value.trim();
  const token = filterSelectionToken + 1;
  filterSelectionToken = token;

  if (!input) {
    setWalletFilterStatus("Enter a wallet or ENS name.", true);
    return;
  }

  walletFilterButtonEl.disabled = true;
  walletFilterInput = input;
  setWalletFilterStatus("Looking up wallet cats...");

  try {
    const validIds = await lookupWalletMoonCats(input);
    if (token !== filterSelectionToken) return;

    if (validIds.length === 0) {
      clearWalletFilterState({ clearStatus: false });
      activeFilter = "all";
      activeFilterSet = null;
      catFilterEl.value = "all";
      setWalletFilterStatus("No MoonCats found for this wallet.");
      updateFilterAppearance();
      updateHoverFromPointer();
      return;
    }

    clearWalletOverlayTextures();
    walletFilterIds = validIds;
    activeFilter = WALLET_FILTER_KEY;
    activeFilterSet = new Set(validIds);
    catFilterEl.value = WALLET_FILTER_KEY;
    setWalletFilterStatus(`Rendering ${validIds.length} wallet cats...`);
    updateFilterAppearance();
    updateHoverFromPointer();

    const atlasImage = await loadAllCatsAtlas();
    if (token !== filterSelectionToken) return;

    const walletTextures = makeWalletOverlayTextures(atlasImage, validIds);
    clearWalletOverlayTextures();
    filterTextureCache.set(WALLET_FILTER_KEY, walletTextures);
    setWalletFilterStatus(`${validIds.length} wallet cats shown.`);
    updateFilterAppearance();
  } catch (error) {
    if (token !== filterSelectionToken) return;
    console.warn("Could not apply wallet CatMoon filter.", error);
    clearWalletFilterState({ clearStatus: false });
    activeFilter = "all";
    activeFilterSet = null;
    catFilterEl.value = "all";
    setWalletFilterStatus(error.message.includes("allcats.png") ? "Wallet overlays failed to load." : "Wallet lookup failed.", true);
    updateFilterAppearance();
    updateHoverFromPointer();
  } finally {
    walletFilterButtonEl.disabled = false;
  }
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
  group.userData.baseMeshes = [];
  group.userData.backingMeshes = [];
  group.userData.overlayMeshes = [];
  group.userData.edgeMeshes = [];
  group.userData.faceNormals = [];
  group.userData.faceUps = [];

  console.assert(faces.length === TRI_FACE_COUNT, `Expected ${TRI_FACE_COUNT} triacontahedron faces, got ${faces.length}`);
  console.assert(TRI_FACE_COUNT * RHOMBUS_CAT_COUNT === MAX_ID + 1, "Triacontahedron face count does not cover the full atlas exactly once");

  faces.forEach((points, faceIndex) => {
    console.assert(points.length === 4, `Face ${faceIndex} does not have 4 vertices`);
    const sorted = orderRhombusFaceVerticesForDiamondUv(points);
    const positions = [];
    for (const point of sorted) {
      positions.push(point.x, point.y, point.z);
    }
    const faceCenter = sorted.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / sorted.length);
    const faceNormal = sorted[1].clone().sub(sorted[0]).cross(sorted[2].clone().sub(sorted[0])).normalize();
    if (faceNormal.dot(faceCenter) < 0) faceNormal.multiplyScalar(-1);
    group.userData.faceNormals[faceIndex] = faceNormal;
    group.userData.faceUps[faceIndex] = sorted[0].clone().sub(sorted[2]).normalize();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();

    const backingMesh = new THREE.Mesh(geometry, makeFilterBackingMaterial());
    backingMesh.userData.faceIndex = faceIndex;
    backingMesh.userData.isFilterBacking = true;
    backingMesh.visible = false;
    backingMesh.renderOrder = 0;
    group.add(backingMesh);
    group.userData.backingMeshes.push(backingMesh);

    const { material, ready } = makeTriFaceMaterial(faceIndex);
    triFaceTexturePromises.push(ready);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.faceIndex = faceIndex;
    mesh.userData.isBaseFace = true;
    mesh.renderOrder = 1;
    group.add(mesh);
    group.userData.baseMeshes.push(mesh);

    const overlayMesh = new THREE.Mesh(geometry, makeFilterOverlayMaterial());
    overlayMesh.userData.faceIndex = faceIndex;
    overlayMesh.userData.isFilterOverlay = true;
    overlayMesh.visible = false;
    overlayMesh.renderOrder = 2;
    group.add(overlayMesh);
    group.userData.overlayMeshes.push(overlayMesh);

    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMesh = new THREE.LineSegments(edgeGeometry, makeFilterEdgeMaterial());
    edgeMesh.userData.faceIndex = faceIndex;
    edgeMesh.userData.isFilterEdge = true;
    edgeMesh.visible = false;
    edgeMesh.renderOrder = 3;
    edgeMesh.raycast = () => {};
    group.add(edgeMesh);
    group.userData.edgeMeshes.push(edgeMesh);
  });

  group.scale.setScalar(0.62);
  group.visible = false;
  console.info(`Triacontahedron: ${TRI_FACE_COUNT} faces x ${RHOMBUS_CAT_COUNT} cats = ${TRI_FACE_COUNT * RHOMBUS_CAT_COUNT}`);
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
  updateFilterAppearance();

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
    preloadFilterOverlayTextures();
    setHoveredId(hoveredId);
  }
});
updateHudLockState();

catFilterEl.addEventListener("change", () => {
  setActiveFilter(catFilterEl.value, { focus: catFilterEl.value !== "all" });
});

walletFilterButtonEl.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  applyWalletFilter();
});

walletFilterInputEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  applyWalletFilter();
});

activeFilterBadgeEl.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setActiveFilter("all");
});

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
  focusInteractionVersion += 1;
  cancelFocusAnimation();
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
