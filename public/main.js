import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import {
  AUTO_ROTATE_EASE_IN_MS,
  AUTO_ROTATE_ENABLED,
  AUTO_ROTATE_RESUME_DELAY_MS,
  AUTO_ROTATE_SPEED_X,
  AUTO_ROTATE_SPEED_Y,
  AUTO_ROTATE_SPEED_Z,
  COLS,
  DRAG_RELEASE_MOMENTUM_MULTIPLIER,
  FILTER_BASE_OPACITY,
  FILTER_FOCUS_DURATION_MS,
  FILTER_KEYS,
  MAX_ID,
  RHOMBUS_CAT_COUNT,
  STAR_PARALLAX_EASE,
  STAR_PARALLAX_ENABLED,
  STAR_PARALLAX_LARGE_STRENGTH,
  STAR_PARALLAX_SMALL_STRENGTH,
  TILE_H,
  TILE_W,
  TOOLTIP_INACTIVITY_HIDE_MS,
  TRI_FACE_COUNT,
  TRI_FACE_TEX_H,
  TRI_FACE_TEX_W,
  TRI_MAX_DISTANCE,
  TRI_MIN_DISTANCE,
  WALLET_CAT_SCALE,
  WALLET_FILTER_KEY,
  WALLET_FILTER_LABEL,
  WALLET_HISTORY_AUTO_LOAD_DEBOUNCE_MS,
  WALLET_LOOKUP_HISTORY_LIMIT,
  WALLET_OVERLAY_SURFACE_OFFSET
} from "./js/config.js";
import { clamp } from "./js/utils.js";
import { getDomRefs } from "./js/dom.js";
import { createFilterManager } from "./js/filters.js";
import { createPreviewManager } from "./js/preview.js";
import { createCatMoonGeometry } from "./js/catmoon-geometry.js";
import { setupCatMoonControls } from "./js/controls.js";
import {
  clearWalletUrl,
  findWalletHistoryEntryByInput,
  getWalletParamFromUrl,
  getWalletUrlValue,
  loadWalletLookupHistory,
  lookupWalletMoonCats,
  normalizeWalletLookupRecord,
  normalizeWalletMatchValue,
  saveWalletLookupHistory,
  setWalletUrl,
  walletHistoryDisplayLabel,
  walletHistoryLookupValue,
  walletHistoryMatchesQuery,
  walletLookupStorageKey
} from "./js/wallet.js";

const {
  smallStarsEl,
  largeStarsEl,
  canvas,
  hud,
  hudLockButton,
  hoverPreviewToggleEl,
  autoTumbleToggleEl,
  catFilterEl,
  walletFilterInputEl,
  walletFilterClearEl,
  walletFilterButtonEl,
  walletFilterStatusEl,
  walletHistoryDropdownEl,
  activeFilterBadgeEl,
  activeFilterNameEl,
  tooltipEl,
  tooltipPreviewEl,
  tooltipLabelEl,
  statusEl,
  loadingOverlay,
  loadingProgressEl
} = getDomRefs();

const HOVER_PREVIEW_STORAGE_KEY = "catmoon.hoverPreviewImages";
const AUTO_TUMBLE_STORAGE_KEY = "catmoon.autoTumble";
const MOONCAT_NAMES_URL = "data/mooncat-names.json";

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
let filterSelectionToken = 0;
let tooltipHideTimer = null;
let pointerInside = false;
let lastClientX = 0;
let lastClientY = 0;
let hoverPreviewImagesEnabled = loadHoverPreviewImageSetting();
let autoTumbleEnabled = loadAutoTumbleSetting();
let moonCatNames = null;
let moonCatNamesPromise = null;
let moonCatNamesLoadFailed = false;
const walletFilterOptionEl = Array.from(catFilterEl.options).find((option) => option.value === WALLET_FILTER_KEY);
let controlsApi = null;
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

const {
  filterTextureCache,
  ensureFilterDataLoaded,
  ensureFilterManifestLoaded,
  ensureFilterTexturesLoaded,
  preloadFilterOverlayTextures
} = createFilterManager({ textureLoader, applyPixelTextureSettings });

const {
  updateTooltipPreview,
  ensureTooltipPreviewAtlasLoaded,
  loadAllCatsAtlas
} = createPreviewManager({
  tooltipPreviewEl,
  getHoveredId: () => hoveredId,
  isTooltipPreviewEnabled: () => hoverPreviewImagesEnabled
});

const {
  triFaceSlots,
  triFaceTexturePromises,
  triTextureStats,
  makeTriacontahedron,
  loadTriFaceSlotMetadata
} = createCatMoonGeometry({
  textureLoader,
  applyPixelTextureSettings,
  makePlaceholderTexture
});

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

function updateHudLockState() {
  hud.classList.toggle("locked", !hudUnlocked);
  hudLockButton.textContent = hudUnlocked ? "🔓" : "🔒";
  const label = hudUnlocked ? "Lock MoonCat details" : "Unlock MoonCat details";
  hudLockButton.setAttribute("aria-label", label);
  hudLockButton.title = label;
}

function loadHoverPreviewImageSetting() {
  try {
    return window.localStorage.getItem(HOVER_PREVIEW_STORAGE_KEY) !== "off";
  } catch (error) {
    return true;
  }
}

function saveHoverPreviewImageSetting(enabled) {
  try {
    window.localStorage.setItem(HOVER_PREVIEW_STORAGE_KEY, enabled ? "on" : "off");
  } catch (error) {
    // The setting still persists for this page session through in-memory state.
  }
}

function updateHoverPreviewToggleUi() {
  hoverPreviewToggleEl.checked = hoverPreviewImagesEnabled;
  tooltipEl.classList.toggle("image-off", !hoverPreviewImagesEnabled);
  if (!hoverPreviewImagesEnabled) {
    updateTooltipPreview(null);
  }
}

function loadAutoTumbleSetting() {
  try {
    return window.localStorage.getItem(AUTO_TUMBLE_STORAGE_KEY) !== "off";
  } catch (error) {
    return true;
  }
}

function saveAutoTumbleSetting(enabled) {
  try {
    window.localStorage.setItem(AUTO_TUMBLE_STORAGE_KEY, enabled ? "on" : "off");
  } catch (error) {
    // The setting still persists for this page session through in-memory state.
  }
}

function updateAutoTumbleToggleUi() {
  autoTumbleToggleEl.checked = autoTumbleEnabled;
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
    tooltipEl.setAttribute("aria-hidden", "true");
    tooltipHideTimer = null;
  }, TOOLTIP_INACTIVITY_HIDE_MS);
}

function hideTooltip() {
  clearTooltipHideTimer();
  tooltipEl.style.display = "none";
  tooltipEl.setAttribute("aria-hidden", "true");
}

function positionTooltip() {
  const offset = 16;
  const margin = 8;
  tooltipEl.style.display = "block";

  const rect = tooltipEl.getBoundingClientRect();
  const left = lastClientX - rect.width - offset;
  const top = lastClientY - rect.height - offset;

  tooltipEl.style.left = `${clamp(left, margin, Math.max(margin, window.innerWidth - rect.width - margin))}px`;
  tooltipEl.style.top = `${clamp(top, margin, Math.max(margin, window.innerHeight - rect.height - margin))}px`;
  tooltipEl.setAttribute("aria-hidden", "false");
}

async function loadMoonCatNames() {
  if (moonCatNames) return moonCatNames;
  if (moonCatNamesLoadFailed) return null;
  if (!moonCatNamesPromise) {
    moonCatNamesPromise = fetch(MOONCAT_NAMES_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((names) => {
        if (!names || typeof names !== "object" || Array.isArray(names)) {
          throw new Error("invalid names payload");
        }
        moonCatNames = names;
        return moonCatNames;
      })
      .catch((error) => {
        moonCatNamesPromise = null;
        moonCatNamesLoadFailed = true;
        console.warn("Could not load MoonCat names.", error);
        return null;
      });
  }

  return moonCatNamesPromise;
}

function updateTooltipLabel(id) {
  tooltipLabelEl.replaceChildren();
  if (id === null) return;

  const idEl = document.createElement("div");
  idEl.className = "tooltipCatId";
  idEl.textContent = `${id}`;
  tooltipLabelEl.append(idEl);

  const name = moonCatNames?.[id];
  if (typeof name === "string" && name) {
    const nameEl = document.createElement("div");
    nameEl.className = "tooltipCatName";
    nameEl.textContent = name;
    tooltipLabelEl.append(nameEl);
  }
}

function ensureMoonCatNamesLoaded(id) {
  if (id === null || moonCatNames || moonCatNamesLoadFailed) return;

  loadMoonCatNames().then((names) => {
    if (!names || hoveredId !== id) return;
    updateTooltipLabel(id);
    positionTooltip();
  });
}

function setHoveredId(id) {
  hoveredId = id;
  updateTooltipPreview(id);
  ensureTooltipPreviewAtlasLoaded();

  if (id === null) {
    hideTooltip();
    return;
  }

  updateTooltipLabel(id);
  positionTooltip();
  ensureMoonCatNamesLoaded(id);
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
  return hoveredId;
}

function openCat(id) {
  if (!hudUnlocked) return;
  if (id === null) return;
  window.open(`https://mooncatrescue.com/mooncats/${id}`, "_blank", "noopener,noreferrer");
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
  if (!triacontahedron || controlsApi?.hasActiveInput()) return;

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
  if (!AUTO_ROTATE_ENABLED || !autoTumbleEnabled || !activeObject) return;
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
  saveWalletLookupHistory(walletLookupHistory);
  updateWalletLookupHistoryUi();
  return normalizedRecord;
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
  const historyEntry = findWalletHistoryEntryByInput(walletLookupHistory, value);
  if (!historyEntry) return;

  const matchValue = normalizeWalletMatchValue(value);
  if (!matchValue) return;
  if (pendingAutoLoadWalletInput === matchValue) return;
  if (lastAutoLoadedWalletInput === matchValue && isWalletHistoryEntryActive(historyEntry, value)) return;

  walletHistoryAutoLoadTimer = window.setTimeout(() => {
    walletHistoryAutoLoadTimer = null;

    const currentValue = walletFilterInputEl.value.trim();
    const currentEntry = findWalletHistoryEntryByInput(walletLookupHistory, currentValue);
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

  const savedLookup = findWalletHistoryEntryByInput(walletLookupHistory, walletParam);

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
  if (autoTumbleEnabled) {
    startAutoRotateNow();
  } else {
    pauseAutoRotate();
  }
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
updateHoverPreviewToggleUi();
updateAutoTumbleToggleUi();
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

hoverPreviewToggleEl.addEventListener("change", () => {
  hoverPreviewImagesEnabled = hoverPreviewToggleEl.checked;
  saveHoverPreviewImageSetting(hoverPreviewImagesEnabled);
  updateHoverPreviewToggleUi();
  setHoveredId(hoveredId);
});

autoTumbleToggleEl.addEventListener("change", () => {
  autoTumbleEnabled = autoTumbleToggleEl.checked;
  saveAutoTumbleSetting(autoTumbleEnabled);
  updateAutoTumbleToggleUi();
  if (autoTumbleEnabled) {
    startAutoRotateNow();
  } else {
    pauseAutoRotate();
  }
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

controlsApi = setupCatMoonControls({
  renderer,
  controls,
  camera,
  getActiveObject: () => activeObject,
  updateHoverFromClient,
  clearHover: () => {
    pointerInside = false;
    setHoveredId(null);
  },
  openCat,
  pauseAutoRotate,
  scheduleAutoRotateResume,
  cancelFocusAnimation,
  incrementFocusInteractionVersion: () => {
    focusInteractionVersion += 1;
  }
});

window.addEventListener("resize", resize);
resize();
