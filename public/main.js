import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import {
  ALL_CATS_ATLAS_URL,
  ATLAS_H,
  ATLAS_W,
  AUTO_ROTATE_EASE_IN_MS,
  AUTO_ROTATE_ENABLED,
  AUTO_ROTATE_RESUME_DELAY_MS,
  AUTO_ROTATE_SPEED_X,
  AUTO_ROTATE_SPEED_Y,
  AUTO_ROTATE_SPEED_Z,
  CLICK_MOVE_LIMIT,
  COLS,
  DESKTOP_ROLL_DRAG_SPEED,
  DRAG_RELEASE_MOMENTUM_MULTIPLIER,
  FILTER_BASE_OPACITY,
  FILTER_DATA_URL,
  FILTER_DEFINITIONS,
  FILTER_FOCUS_DURATION_MS,
  FILTER_KEYS,
  FILTER_MANIFEST_URL,
  MAX_ID,
  PHI,
  PRELOAD_FILTER_KEYS,
  PREVIEW_SCALE,
  RHOMBUS_CAT_COUNT,
  ROWS,
  STAR_PARALLAX_EASE,
  STAR_PARALLAX_ENABLED,
  STAR_PARALLAX_LARGE_STRENGTH,
  STAR_PARALLAX_SMALL_STRENGTH,
  TILE_H,
  TILE_W,
  TOOLTIP_INACTIVITY_HIDE_MS,
  TOUCH_TWIST_ROLL_SPEED,
  TRI_FACE_CAT_PIXEL_SCALE,
  TRI_FACE_COUNT,
  TRI_FACE_LONG_DIAG,
  TRI_FACE_METADATA_URL,
  TRI_FACE_TEX_H,
  TRI_FACE_TEX_W,
  TRI_FACE_TEXTURE_SCALE,
  TRI_FACE_SHORT_DIAG,
  TRI_MAX_DISTANCE,
  TRI_MIN_DISTANCE,
  WALLET_CAT_SCALE,
  WALLET_FILTER_KEY,
  WALLET_FILTER_LABEL,
  WALLET_HISTORY_AUTO_LOAD_DEBOUNCE_MS,
  WALLET_LOOKUP_HISTORY_KEY,
  WALLET_LOOKUP_HISTORY_LIMIT,
  WALLET_OVERLAY_SURFACE_OFFSET,
  filterTextureUrl,
  triFaceTextureUrl
} from "./js/config.js";
import { clamp } from "./js/utils.js";
import { getDomRefs } from "./js/dom.js";

const {
  smallStarsEl,
  largeStarsEl,
  canvas,
  hud,
  hudLockButton,
  catIdEl,
  previewEl,
  catFilterEl,
  walletFilterInputEl,
  walletFilterClearEl,
  walletFilterButtonEl,
  walletFilterStatusEl,
  walletHistoryDropdownEl,
  activeFilterBadgeEl,
  activeFilterNameEl,
  tooltipEl,
  statusEl,
  loadingOverlay,
  loadingProgressEl
} = getDomRefs();

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
let walletFilterLabel = "";
let lastWalletLookup = null;
let walletLookupHistory = [];
let walletHistoryAutoLoadTimer = null;
let pendingAutoLoadWalletInput = "";
let lastAutoLoadedWalletInput = "";
let walletHistoryDropdownOpen = false;
let walletHistorySelectionInProgress = false;
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
const walletFilterOptionEl = Array.from(catFilterEl.options).find((option) => option.value === WALLET_FILTER_KEY);
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

function ensurePreviewAtlasLoaded() {
  if (!hudUnlocked || hoveredId === null || allCatsAtlasImage) return;

  loadAllCatsAtlas().catch((error) => {
    console.warn("Could not load CatMoon preview atlas.", error);
  });
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
  ensurePreviewAtlasLoaded();

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

function updateHoverFromClient(clientX, clientY) {
  pointerInside = true;
  lastClientX = clientX;
  lastClientY = clientY;
  updatePointerFromClient(clientX, clientY);
  updateHoverFromPointer();
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

function beginRollDrag(event) {
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

function releaseRendererPointerCapture(pointerId) {
  try {
    renderer.domElement.releasePointerCapture?.(pointerId);
  } catch (error) {
    // Pointer capture may already be gone after blur/cancel.
  }
}

function endRollDrag(event) {
  if (!rollDrag) return;

  const pointerId = rollDrag.pointerId;
  rollDrag = null;
  controls.enabled = true;
  if (event) {
    releaseRendererPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  } else {
    releaseRendererPointerCapture(pointerId);
  }
  downPoint = null;
  scheduleAutoRotateResume();
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

function walletLookupStorageKey(record) {
  return (record.address || record.resolvedName || record.input || record.label || "").toLowerCase();
}

function normalizeWalletMatchValue(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getWalletUrlValue(lookupResult) {
  const resolvedName = typeof lookupResult?.resolvedName === "string" ? lookupResult.resolvedName.trim() : "";
  if (resolvedName) return resolvedName;

  const address = typeof lookupResult?.address === "string" ? lookupResult.address.trim() : "";
  return address;
}

function setWalletUrl(value) {
  if (!window.history?.replaceState) return;

  const walletValue = typeof value === "string" ? value.trim() : "";
  if (!walletValue) {
    clearWalletUrl();
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set("wallet", walletValue);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function clearWalletUrl() {
  if (!window.history?.replaceState) return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has("wallet")) return;
  url.searchParams.delete("wallet");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function getWalletParamFromUrl() {
  const value = new URLSearchParams(window.location.search).get("wallet");
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWalletLookupRecord(record) {
  let ids;
  try {
    ids = normalizeWalletMoonCatIds(record?.ids);
  } catch (error) {
    return null;
  }
  if (ids.length === 0) return null;

  const address = typeof record.address === "string" ? record.address : "";
  const resolvedName = typeof record.resolvedName === "string" ? record.resolvedName : "";
  const input = typeof record.input === "string" ? record.input : (resolvedName || address);
  const label = record.label || walletDisplayLabel({ resolvedName, address }, input);
  const key = walletLookupStorageKey({ address, resolvedName, input, label });
  if (!key) return null;

  return {
    input,
    address,
    resolvedName,
    label,
    ids,
    count: ids.length,
    lastUsed: Number.isFinite(record.lastUsed) ? record.lastUsed : Date.now()
  };
}

function loadWalletLookupHistory() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WALLET_LOOKUP_HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeWalletLookupRecord)
      .filter(Boolean)
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, WALLET_LOOKUP_HISTORY_LIMIT);
  } catch (error) {
    return [];
  }
}

function saveWalletLookupHistory() {
  try {
    window.localStorage.setItem(WALLET_LOOKUP_HISTORY_KEY, JSON.stringify(walletLookupHistory));
  } catch (error) {
    console.warn("Could not save CatMoon wallet lookup history.", error);
  }
}

function rememberWalletLookup(record) {
  const normalizedRecord = normalizeWalletLookupRecord({
    ...record,
    lastUsed: Date.now()
  });
  if (!normalizedRecord) return null;

  const key = walletLookupStorageKey(normalizedRecord);
  walletLookupHistory = [
    normalizedRecord,
    ...walletLookupHistory.filter((item) => walletLookupStorageKey(item) !== key)
  ].slice(0, WALLET_LOOKUP_HISTORY_LIMIT);
  lastWalletLookup = normalizedRecord;
  saveWalletLookupHistory();
  updateWalletLookupHistoryUi();
  return normalizedRecord;
}

function findWalletHistoryEntryByInput(value) {
  const matchValue = normalizeWalletMatchValue(value);
  if (!matchValue) return null;

  return walletLookupHistory.find((record) => (
    [
      record.input,
      record.resolvedName,
      record.address,
      record.label
    ].some((candidate) => normalizeWalletMatchValue(candidate) === matchValue)
  )) || null;
}

function walletHistoryLookupValue(record) {
  return getWalletUrlValue(record) || record.input || record.label || "";
}

function walletHistoryDisplayLabel(record) {
  if (record?.resolvedName) return record.resolvedName;
  if (typeof record?.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(record.address)) {
    return abbreviateEthAddress(record.address);
  }
  return record?.label || record?.input || walletHistoryLookupValue(record);
}

function walletHistoryMatchesQuery(record, query) {
  const matchValue = normalizeWalletMatchValue(query);
  if (!matchValue) return true;

  return [
    walletHistoryDisplayLabel(record),
    record.input,
    record.resolvedName,
    record.address,
    record.label
  ].some((candidate) => normalizeWalletMatchValue(candidate).includes(matchValue));
}

function filteredWalletHistoryEntries() {
  const query = walletFilterInputEl.value.trim();
  return walletLookupHistory.filter((record) => walletHistoryMatchesQuery(record, query));
}

function hideWalletHistoryDropdown() {
  walletHistoryDropdownOpen = false;
  walletHistoryDropdownEl.hidden = true;
  walletFilterInputEl.setAttribute("aria-expanded", "false");
}

function showWalletHistoryDropdown() {
  const entries = filteredWalletHistoryEntries();
  walletHistoryDropdownEl.replaceChildren();

  if (!entries.length) {
    hideWalletHistoryDropdown();
    return;
  }

  entries.forEach((record, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "walletHistoryOption";
    option.setAttribute("role", "option");
    option.id = `walletHistoryOption${index}`;
    option.dataset.historyIndex = String(walletLookupHistory.indexOf(record));
    option.textContent = walletHistoryDisplayLabel(record);
    walletHistoryDropdownEl.appendChild(option);
  });

  walletHistoryDropdownOpen = true;
  walletHistoryDropdownEl.hidden = false;
  walletFilterInputEl.setAttribute("aria-expanded", "true");
}

function refreshWalletHistoryDropdown() {
  if (walletHistorySelectionInProgress) return;
  if (document.activeElement !== walletFilterInputEl && !walletHistoryDropdownOpen) return;
  showWalletHistoryDropdown();
}

function updateWalletLookupHistoryUi() {
  refreshWalletHistoryDropdown();

  if (!lastWalletLookup && walletLookupHistory.length) {
    lastWalletLookup = walletLookupHistory[0];
  }

  if (!walletFilterOptionEl) return;
  if (lastWalletLookup) {
    walletFilterOptionEl.hidden = false;
    walletFilterOptionEl.disabled = false;
    walletFilterOptionEl.textContent = `Wallet Cats — ${lastWalletLookup.label}`;
  } else {
    walletFilterOptionEl.hidden = true;
    walletFilterOptionEl.disabled = true;
    walletFilterOptionEl.textContent = "Wallet Cats";
  }
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

  const ids = normalizeWalletMoonCatIds(payload?.ids);
  return {
    input: payload?.input || input,
    address: payload?.address || "",
    resolvedName: payload?.resolvedName || "",
    ids,
    label: walletDisplayLabel(payload, input)
  };
}

function abbreviateEthAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function walletDisplayLabel(payload, fallback) {
  if (payload?.resolvedName) {
    return payload.resolvedName;
  }
  if (typeof payload?.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(payload.address)) {
    return abbreviateEthAddress(payload.address);
  }
  return fallback;
}

function setWalletFilterStatus(message, isError = false) {
  walletFilterStatusEl.textContent = message;
  walletFilterStatusEl.classList.toggle("error", isError);
}

function updateWalletClearButton() {
  walletFilterClearEl.hidden = walletFilterInputEl.value.length === 0;
}

function clearWalletFilterState({ clearStatus = true } = {}) {
  walletFilterInput = "";
  walletFilterIds = [];
  walletFilterLabel = "";
  clearWalletOverlayTextures();
  if (clearStatus) {
    setWalletFilterStatus("");
  }
}

function drawCatFromAtlas(context, atlasImage, id, destRect) {
  const srcCol = id % COLS;
  const srcRow = Math.floor(id / COLS);
  const centerX = destRect.x + destRect.w / 2;
  const centerY = destRect.y + destRect.h / 2;
  const scaledW = destRect.w * WALLET_CAT_SCALE;
  const scaledH = destRect.h * WALLET_CAT_SCALE;
  context.drawImage(
    atlasImage,
    srcCol * TILE_W,
    srcRow * TILE_H,
    TILE_W,
    TILE_H,
    Math.round(centerX - scaledW / 2),
    Math.round(centerY - scaledH / 2),
    Math.round(scaledW),
    Math.round(scaledH)
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
    return walletFilterLabel ? `${walletFilterLabel} ${WALLET_FILTER_LABEL}` : WALLET_FILTER_LABEL;
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
  const isWalletFilter = activeFilter === WALLET_FILTER_KEY;

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
    const faceNormal = triacontahedron.userData.faceNormals?.[faceIndex];
    if (isWalletFilter && faceNormal) {
      mesh.position.copy(faceNormal).multiplyScalar(WALLET_OVERLAY_SURFACE_OFFSET);
    } else {
      mesh.position.set(0, 0, 0);
    }

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

async function setActiveFilter(filterKey, { focus = false, updateUrl = true } = {}) {
  const token = filterSelectionToken + 1;
  filterSelectionToken = token;
  clearWalletFilterState();
  updateFilterAppearance();

  if (filterKey === WALLET_FILTER_KEY) {
    await restoreWalletFilter(token, { updateUrl });
    return;
  }

  if (updateUrl) {
    clearWalletUrl();
  }

  const nextFilter = FILTER_KEYS.has(filterKey) ? filterKey : "all";

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

async function applyWalletLookupRecord(record, token, { restored = false } = {}) {
  const walletRecord = normalizeWalletLookupRecord(record);
  if (!walletRecord) {
    throw new Error("Saved wallet lookup is missing MoonCat IDs. Run lookup again.");
  }

  clearWalletOverlayTextures();
  walletFilterInput = walletRecord.input;
  walletFilterIds = walletRecord.ids;
  walletFilterLabel = walletRecord.label;
  activeFilter = WALLET_FILTER_KEY;
  activeFilterSet = new Set(walletRecord.ids);
  catFilterEl.value = WALLET_FILTER_KEY;
  setWalletFilterStatus(`${restored ? "Restoring" : "Rendering"} ${walletRecord.count} MoonCats for ${walletRecord.label}...`);
  updateFilterAppearance();
  updateHoverFromPointer();

  const atlasImage = await loadAllCatsAtlas();
  if (token !== filterSelectionToken) return;

  const walletTextures = makeWalletOverlayTextures(atlasImage, walletRecord.ids);
  clearWalletOverlayTextures();
  filterTextureCache.set(WALLET_FILTER_KEY, walletTextures);
  setWalletFilterStatus(`${restored ? "Restored" : "Found"} ${walletRecord.count} MoonCats for ${walletRecord.label}.`);
  updateFilterAppearance();
}

async function restoreWalletFilter(token, { updateUrl = true } = {}) {
  if (!lastWalletLookup) {
    setWalletFilterStatus("Run a wallet lookup before selecting Wallet Cats.", true);
    activeFilter = "all";
    activeFilterSet = null;
    catFilterEl.value = "all";
    updateFilterAppearance();
    updateHoverFromPointer();
    return;
  }

  try {
    await applyWalletLookupRecord(lastWalletLookup, token, { restored: true });
    if (token !== filterSelectionToken) return;
    if (updateUrl) {
      setWalletUrl(getWalletUrlValue(lastWalletLookup));
    }
  } catch (error) {
    if (token !== filterSelectionToken) return;
    console.warn("Could not restore CatMoon wallet filter.", error);
    setWalletFilterStatus(error.message || "Run wallet lookup again.", true);
    activeFilter = "all";
    activeFilterSet = null;
    catFilterEl.value = "all";
    updateFilterAppearance();
    updateHoverFromPointer();
  }
}

async function applyWalletFilter({ updateUrl = true } = {}) {
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
    const walletResult = await lookupWalletMoonCats(input);
    if (token !== filterSelectionToken) return;

    const validIds = walletResult.ids;
    if (validIds.length === 0) {
      clearWalletFilterState({ clearStatus: false });
      activeFilter = "all";
      activeFilterSet = null;
      catFilterEl.value = "all";
      setWalletFilterStatus(`No MoonCats found for ${walletResult.label}.`);
      updateFilterAppearance();
      updateHoverFromPointer();
      return;
    }

    const rememberedLookup = rememberWalletLookup(walletResult);
    await applyWalletLookupRecord(rememberedLookup, token);
    if (token !== filterSelectionToken) return;
    if (updateUrl) {
      setWalletUrl(getWalletUrlValue(rememberedLookup));
    }
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

async function restoreWalletLookupFromHistory(entry) {
  const walletRecord = normalizeWalletLookupRecord(entry);
  if (!walletRecord) {
    await applyWalletFilter();
    return;
  }

  const rememberedLookup = rememberWalletLookup(walletRecord);
  const token = filterSelectionToken + 1;
  filterSelectionToken = token;

  try {
    await applyWalletLookupRecord(rememberedLookup, token, { restored: true });
    if (token !== filterSelectionToken) return;
    setWalletUrl(getWalletUrlValue(rememberedLookup));
  } catch (error) {
    if (token !== filterSelectionToken) return;
    console.warn("Could not restore CatMoon wallet lookup from history.", error);
    setWalletFilterStatus(error.message || "Run wallet lookup again.", true);
    activeFilter = "all";
    activeFilterSet = null;
    catFilterEl.value = "all";
    updateFilterAppearance();
    updateHoverFromPointer();
  }
}

function isWalletHistoryEntryActive(entry, value) {
  if (activeFilter !== WALLET_FILTER_KEY) return false;
  const matchValue = normalizeWalletMatchValue(value);
  if (!matchValue) return false;

  const activeRecord = lastWalletLookup || entry;
  return [
    activeRecord.input,
    activeRecord.resolvedName,
    activeRecord.address,
    activeRecord.label,
    getWalletUrlValue(activeRecord)
  ].some((candidate) => normalizeWalletMatchValue(candidate) === matchValue);
}

function scheduleWalletHistoryAutoLoad() {
  if (walletHistoryAutoLoadTimer) {
    window.clearTimeout(walletHistoryAutoLoadTimer);
    walletHistoryAutoLoadTimer = null;
  }

  const value = walletFilterInputEl.value.trim();
  const historyEntry = findWalletHistoryEntryByInput(value);
  if (!historyEntry) return;

  const matchValue = normalizeWalletMatchValue(value);
  if (!matchValue) return;
  if (pendingAutoLoadWalletInput === matchValue) return;
  if (lastAutoLoadedWalletInput === matchValue && isWalletHistoryEntryActive(historyEntry, value)) return;

  walletHistoryAutoLoadTimer = window.setTimeout(() => {
    walletHistoryAutoLoadTimer = null;

    const currentValue = walletFilterInputEl.value.trim();
    const currentEntry = findWalletHistoryEntryByInput(currentValue);
    const currentMatchValue = normalizeWalletMatchValue(currentValue);
    if (!currentEntry || !currentMatchValue) return;
    if (pendingAutoLoadWalletInput === currentMatchValue) return;
    if (lastAutoLoadedWalletInput === currentMatchValue && isWalletHistoryEntryActive(currentEntry, currentValue)) return;

    pendingAutoLoadWalletInput = currentMatchValue;
    sceneReadyPromise
      .then(() => restoreWalletLookupFromHistory(currentEntry))
      .then(() => {
        lastAutoLoadedWalletInput = currentMatchValue;
      })
      .catch((error) => {
        console.warn("Could not auto-load CatMoon wallet history entry.", error);
      })
      .finally(() => {
        if (pendingAutoLoadWalletInput === currentMatchValue) {
          pendingAutoLoadWalletInput = "";
        }
      });
  }, WALLET_HISTORY_AUTO_LOAD_DEBOUNCE_MS);
}

function selectWalletHistoryEntry(entry) {
  if (walletHistorySelectionInProgress) return;

  const lookupValue = walletHistoryLookupValue(entry);
  if (!lookupValue) return;

  walletHistorySelectionInProgress = true;
  if (walletHistoryAutoLoadTimer) {
    window.clearTimeout(walletHistoryAutoLoadTimer);
    walletHistoryAutoLoadTimer = null;
  }
  pendingAutoLoadWalletInput = normalizeWalletMatchValue(lookupValue);
  walletFilterInputEl.value = lookupValue;
  updateWalletClearButton();
  hideWalletHistoryDropdown();

  sceneReadyPromise
    .then(() => restoreWalletLookupFromHistory(entry))
    .then(() => {
      lastAutoLoadedWalletInput = normalizeWalletMatchValue(lookupValue);
    })
    .catch((error) => {
      console.warn("Could not load selected CatMoon wallet history entry.", error);
    })
    .finally(() => {
      pendingAutoLoadWalletInput = "";
      window.setTimeout(() => {
        walletHistorySelectionInProgress = false;
      }, WALLET_HISTORY_AUTO_LOAD_DEBOUNCE_MS);
    });
}

async function applyWalletFromUrl({ updateUrl = true } = {}) {
  const walletParam = getWalletParamFromUrl();
  if (!walletParam) return;

  walletFilterInputEl.value = walletParam;
  updateWalletClearButton();
  await applyWalletFilter({ updateUrl });
}

async function syncWalletFilterFromUrl() {
  const walletParam = getWalletParamFromUrl();
  if (!walletParam) {
    await setActiveFilter("all", { updateUrl: false });
    return;
  }

  const savedLookup = walletLookupHistory.find((record) => (
    [getWalletUrlValue(record), record.input]
      .filter(Boolean)
      .some((value) => value.toLowerCase() === walletParam.toLowerCase())
  ));

  walletFilterInputEl.value = walletParam;
  updateWalletClearButton();

  if (savedLookup) {
    const token = filterSelectionToken + 1;
    filterSelectionToken = token;
    lastWalletLookup = savedLookup;
    updateWalletLookupHistoryUi();
    try {
      await applyWalletLookupRecord(savedLookup, token, { restored: true });
    } catch (error) {
      if (token !== filterSelectionToken) return;
      console.warn("Could not restore CatMoon wallet filter from URL.", error);
      setWalletFilterStatus(error.message || "Run wallet lookup again.", true);
    }
    return;
  }

  await applyWalletFilter({ updateUrl: false });
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
  statusEl.textContent = `Drag to tumble, scroll/pinch zoom, twist or Ctrl/Alt-drag, right click-drag to roll.`;
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

const sceneReadyPromise = initializeScene();
sceneReadyPromise.catch((error) => {
  console.error("Could not initialize CatMoon scene.", error);
  setLoadingProgress(error.message || "Could not initialize CatMoon scene.");
  statusEl.textContent = "Could not initialize CatMoon scene.";
});
sceneReadyPromise.then(
  () => applyWalletFromUrl().catch((error) => {
    console.error("Could not apply CatMoon wallet lookup from URL.", error);
  }),
  () => {}
);

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
walletLookupHistory = loadWalletLookupHistory();
updateWalletLookupHistoryUi();
const initialWalletParam = getWalletParamFromUrl();
if (initialWalletParam) {
  walletFilterInputEl.value = initialWalletParam;
}
updateWalletClearButton();

catFilterEl.addEventListener("change", () => {
  setActiveFilter(catFilterEl.value, { focus: catFilterEl.value !== "all" });
});

walletFilterButtonEl.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  applyWalletFilter();
});

walletFilterClearEl.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (walletHistoryAutoLoadTimer) {
    window.clearTimeout(walletHistoryAutoLoadTimer);
    walletHistoryAutoLoadTimer = null;
  }
  pendingAutoLoadWalletInput = "";
  lastAutoLoadedWalletInput = "";
  walletFilterInputEl.value = "";
  updateWalletClearButton();
  walletFilterInputEl.focus();
  showWalletHistoryDropdown();
});

walletFilterInputEl.addEventListener("input", () => {
  updateWalletClearButton();
  showWalletHistoryDropdown();
  scheduleWalletHistoryAutoLoad();
});

walletFilterInputEl.addEventListener("change", scheduleWalletHistoryAutoLoad);

walletFilterInputEl.addEventListener("focus", showWalletHistoryDropdown);

walletFilterInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideWalletHistoryDropdown();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  hideWalletHistoryDropdown();
  applyWalletFilter();
});

walletHistoryDropdownEl.addEventListener("pointerdown", (event) => {
  const option = event.target.closest(".walletHistoryOption");
  if (!option) return;

  event.preventDefault();
  event.stopPropagation();
  const historyIndex = Number(option.dataset.historyIndex);
  const entry = walletLookupHistory[historyIndex];
  if (entry) {
    selectWalletHistoryEntry(entry);
  }
});

activeFilterBadgeEl.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setActiveFilter("all");
});

document.addEventListener("pointerdown", (event) => {
  if (
    event.target === walletFilterInputEl
    || walletFilterInputEl.contains(event.target)
    || walletHistoryDropdownEl.contains(event.target)
    || walletFilterClearEl.contains(event.target)
  ) {
    return;
  }
  hideWalletHistoryDropdown();
});

window.addEventListener("popstate", () => {
  sceneReadyPromise
    .then(() => syncWalletFilterFromUrl())
    .catch(() => {});
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

  updateHoverFromClient(event.clientX, event.clientY);
}, { capture: true });

renderer.domElement.addEventListener("pointerleave", () => {
  pointerInside = false;
  setHoveredId(null);
});

renderer.domElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
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

  if (hudUnlocked && event.pointerType === "touch") {
    updateHoverFromClient(event.clientX, event.clientY);
  }

  const isRightMouseRoll = event.pointerType === "mouse" && event.button === 2;
  if ((isRightMouseRoll || event.ctrlKey || event.altKey) && canRollActiveObject()) {
    beginRollDrag(event);
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
    endRollDrag(event);
    return;
  }

  if (!downPoint) return;

  const dx = event.clientX - downPoint.x;
  const dy = event.clientY - downPoint.y;
  const moved = Math.hypot(dx, dy);

  updateHoverFromClient(event.clientX, event.clientY);

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
    endRollDrag(event);
    return;
  }
  downPoint = null;
  scheduleAutoRotateResume();
}, { capture: true });

window.addEventListener("blur", () => {
  if (rollDrag) {
    endRollDrag();
  }
});

window.addEventListener("resize", resize);
resize();
