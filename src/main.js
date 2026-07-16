import * as THREE from "three";
import { TrackballControls } from "three/addons/controls/TrackballControls.js";
import "./styles.css";
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
  DESKTOP_ROTATE_SPEED,
  MAX_ID,
  MOONCAT_NAMES_URL,
  RHOMBUS_CAT_COUNT,
  SET_ONLY_FILTER_KEYS,
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
import { createBackgroundController } from "./js/backgrounds.js";
import { getDomRefs, loadBooleanSetting, saveBooleanSetting } from "./js/dom.js";
import {
  createPerformanceMonitor,
  PERFORMANCE_MONITOR_STORAGE_KEY
} from "./js/performance-monitor.js";
import { createFilterManager } from "./js/filters.js";
import { createPreviewManager } from "./js/preview.js";
import { createCatMoonGeometry, parseRescueId } from "./js/catmoon-geometry.js";
import { createMoonCatDetailsLoader, moonCatDetailLinks } from "./js/cat-details.js";
import { setupCatMoonControls } from "./js/controls.js";
import {
  createAfterimageEffects,
  createCatMoonRenderer,
  createDepthOfFieldEffects,
  createLitMoonLighting,
  createTextureManager,
  DEPTH_OF_FIELD_CONTROL_META,
  DEPTH_OF_FIELD_DEFAULTS,
  clampDepthOfFieldValue,
  loadDepthOfFieldSettings,
  normalizeDepthOfFieldSettings,
  saveDepthOfFieldSettings,
  modeUsesAfterimage,
  modeUsesDepthOfField,
  modeUsesLitMoon,
  normalizeRenderMode,
  RENDER_MODE_STORAGE_KEY
} from "./js/rendering.js";
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
  hudHelpButton,
  hudHelpPanel,
  hoverPreviewToggleEl,
  autoTumbleToggleEl,
  catLinksToggleEl,
  earlyRescueZoneToggleEl,
  hybridStarfieldToggleEl,
  performanceMonitorToggleEl,
  performanceMonitorEl,
  performanceMonitorGraphEl,
  performanceMonitorCurrentFpsEl,
  performanceMonitorSmoothedFpsEl,
  performanceMonitorFrameTimeEl,
  performanceMonitorAverageFrameTimeEl,
  performanceMonitorDrawCallsEl,
  performanceMonitorTrianglesEl,
  performanceMonitorPointsEl,
  renderModeSelectEl,
  depthOfFieldControlsEl,
  depthOfFieldFocusInputEl,
  depthOfFieldFocusValueEl,
  depthOfFieldApertureInputEl,
  depthOfFieldApertureValueEl,
  depthOfFieldMaxBlurInputEl,
  depthOfFieldMaxBlurValueEl,
  depthOfFieldResetEl,
  catFilterEl,
  rescueLookupInputEl,
  rescueLookupButtonEl,
  rescueLookupStatusEl,
  walletFilterInputEl,
  walletFilterClearEl,
  walletFilterButtonEl,
  walletFilterStatusEl,
  walletHistoryDropdownEl,
  activeFilterBadgeEl,
  activeFilterNameEl,
  activeFilterStatEl,
  tooltipEl,
  tooltipPreviewEl,
  tooltipLabelEl,
  pinnedTooltipEl,
  pinnedTooltipPreviewEl,
  pinnedTooltipLabelEl,
  catDetailsDialogEl,
  catDetailsCloseEl,
  catDetailsTitleEl,
  catDetailsPreviewEl,
  catDetailsStatusEl,
  catDetailsTraitsEl,
  catDetailsRetryEl,
  catDetailsChainStationEl,
  catDetailsOpenSeaEl,
  statusEl,
  loadingOverlay,
  loadingProgressEl
} = getDomRefs();

const HOVER_PREVIEW_STORAGE_KEY = "catmoon.hoverPreviewImages";
const AUTO_TUMBLE_STORAGE_KEY = "catmoon.autoTumble";
const CAT_LINKS_STORAGE_KEY = "catmoon.catLinks";
const EARLY_RESCUE_ZONE_STORAGE_KEY = "catmoon.earlyRescueZone";
const HYBRID_STARFIELD_ENABLED_STORAGE_KEY = "catmoon.hybridStarfieldEnabled.v1";
const PINNED_TOOLTIP_DRIFT_LIMIT_PX = 140;
const HOVER_INTENT_DELAY_MS = 180;
const TOUCH_HOVER_COOLDOWN_MS = 300;
const MOBILE_HUD_MEDIA_QUERY = "(max-width: 520px)";
const RESCUE_LOOKUP_TARGET_DISTANCE = 1.5;
const EARLY_RESCUE_ZONE_VISIBLE_FILTERS = new Set(["named", "characters", WALLET_FILTER_KEY]);

function loadRenderModeSetting() {
  try {
    return normalizeRenderMode(window.localStorage.getItem(RENDER_MODE_STORAGE_KEY));
  } catch {
    return "pixel";
  }
}

function saveRenderModeSetting(mode) {
  try {
    window.localStorage.setItem(RENDER_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage may be unavailable in private or restricted browsing contexts.
  }
}

function loadHybridStarfieldEnabledSetting() {
  return loadBooleanSetting(undefined, HYBRID_STARFIELD_ENABLED_STORAGE_KEY, true);
}

function saveHybridStarfieldEnabledSetting(enabled) {
  saveBooleanSetting(undefined, HYBRID_STARFIELD_ENABLED_STORAGE_KEY, enabled);
}

function updateHybridStarfieldToggleUi() {
  hybridStarfieldToggleEl.checked = hybridStarfieldEnabled;
}

function loadPerformanceMonitorEnabledSetting() {
  return loadBooleanSetting(undefined, PERFORMANCE_MONITOR_STORAGE_KEY, false);
}

function savePerformanceMonitorEnabledSetting(enabled) {
  saveBooleanSetting(undefined, PERFORMANCE_MONITOR_STORAGE_KEY, enabled);
}

function updatePerformanceMonitorToggleUi() {
  performanceMonitorToggleEl.checked = performanceMonitorEnabled;
}

function updateRenderModeUi() {
  renderModeSelectEl.value = renderMode;
  updateDepthOfFieldControlsUi();
}

let renderMode = loadRenderModeSetting();
let depthOfFieldSettings = loadDepthOfFieldSettings();
let hybridStarfieldEnabled = loadHybridStarfieldEnabledSetting();
let performanceMonitorEnabled = loadPerformanceMonitorEnabledSetting();
const depthOfFieldControls = Object.freeze({
  focus: Object.freeze({ input: depthOfFieldFocusInputEl, value: depthOfFieldFocusValueEl }),
  aperture: Object.freeze({ input: depthOfFieldApertureInputEl, value: depthOfFieldApertureValueEl }),
  maxBlur: Object.freeze({ input: depthOfFieldMaxBlurInputEl, value: depthOfFieldMaxBlurValueEl })
});

function formatDepthOfFieldValue(key, value) {
  return Number(value).toFixed(DEPTH_OF_FIELD_CONTROL_META[key].decimals);
}

function updateDepthOfFieldControlsUi() {
  const visible = modeUsesDepthOfField(renderMode);
  depthOfFieldControlsEl.hidden = !visible;
  for (const [key, control] of Object.entries(depthOfFieldControls)) {
    const meta = DEPTH_OF_FIELD_CONTROL_META[key];
    const value = depthOfFieldSettings[key];
    control.input.min = String(meta.min);
    control.input.max = String(meta.max);
    control.input.step = String(meta.step);
    control.input.value = String(value);
    control.value.value = formatDepthOfFieldValue(key, value);
  }
}

function updateDepthOfFieldSettings(nextSettings, { persist = true, apply = true } = {}) {
  depthOfFieldSettings = normalizeDepthOfFieldSettings({ ...depthOfFieldSettings, ...nextSettings });
  if (persist) saveDepthOfFieldSettings(undefined, depthOfFieldSettings);
  updateDepthOfFieldControlsUi();
  if (apply) depthOfField?.setSettings(depthOfFieldSettings);
}

const rendering = createCatMoonRenderer(canvas);
const { renderer } = rendering;
const textureManager = createTextureManager(renderMode);
const applyTextureSettings = textureManager.applyTextureSettings;

const scene = new THREE.Scene();
const backgroundController = createBackgroundController({
  scene,
  viewportWidth: window.innerWidth,
  coarsePointer: window.matchMedia?.("(pointer: coarse)")?.matches ?? false
});
backgroundController.setEnabled(hybridStarfieldEnabled);
const performanceMonitor = createPerformanceMonitor({
  container: performanceMonitorEl,
  graphCanvas: performanceMonitorGraphEl,
  currentFpsEl: performanceMonitorCurrentFpsEl,
  smoothedFpsEl: performanceMonitorSmoothedFpsEl,
  frameTimeEl: performanceMonitorFrameTimeEl,
  averageFrameTimeEl: performanceMonitorAverageFrameTimeEl,
  drawCallsEl: performanceMonitorDrawCallsEl,
  trianglesEl: performanceMonitorTrianglesEl,
  pointsEl: performanceMonitorPointsEl
});
performanceMonitor.setEnabled(performanceMonitorEnabled);
const litMoonLighting = createLitMoonLighting(scene);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera.position.set(0, 0, 3.15);

const controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = DESKTOP_ROTATE_SPEED;
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
let hudHelpOpen = false;
let activeFilter = "all";
let activeFilterSet = null;
let activeFilterCounts = null;
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
let hoverIntentTimer = null;
let transientHoverSuppressedUntil = 0;
let pointerInside = false;
let lastClientX = 0;
let lastClientY = 0;
let hoverPreviewImagesEnabled = loadHoverPreviewImageSetting();
let autoTumbleEnabled = loadAutoTumbleSetting();
let catLinksEnabled = loadCatLinksSetting();
let earlyRescueZoneEnabled = loadEarlyRescueZoneSetting();
let pinnedCatId = null;
let pinnedTooltipAnchorX = 0;
let pinnedTooltipAnchorY = 0;
let pinnedCatLocalPoint = null;
let moonCatNames = null;
let moonCatNamesPromise = null;
let moonCatNamesLoadFailed = false;
let catDetailsDialogId = null;
let catDetailsRequestToken = 0;
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
let afterimage = null;
let depthOfField = null;

function ensureAfterimage() {
  if (!afterimage) {
    afterimage = createAfterimageEffects(renderer, scene, camera);
    afterimage.resize(window.innerWidth, window.innerHeight);
  }
  return afterimage;
}

function ensureDepthOfField() {
  if (!depthOfField) {
    depthOfField = createDepthOfFieldEffects(renderer, scene, camera, depthOfFieldSettings);
    depthOfField.resize(window.innerWidth, window.innerHeight);
  }
  return depthOfField;
}

function updatePostProcessingModes() {
  if (modeUsesAfterimage(renderMode)) {
    ensureAfterimage();
  } else {
    afterimage?.dispose();
    afterimage = null;
  }

  if (modeUsesDepthOfField(renderMode)) {
    ensureDepthOfField();
  } else {
    depthOfField?.dispose();
    depthOfField = null;
  }
}

function updateLitMoonMode() {
  const isLitMoon = modeUsesLitMoon(renderMode);
  setBaseMaterialMode(isLitMoon ? "lit" : "unlit");
  litMoonLighting.setEnabled(isLitMoon);
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
  return applyTextureSettings(new THREE.CanvasTexture(placeholderCanvas));
}

const {
  filterTextureCache,
  ensureFilterDataLoaded,
  ensureFilterCountsLoaded,
  ensureFilterManifestLoaded,
  ensureFilterTexturesLoaded,
  preloadFilterOverlayTextures
} = createFilterManager({ textureLoader, applyTextureSettings });

const {
  updateTooltipPreview,
  updatePinnedTooltipPreview,
  updateDetailPreview,
  ensureTooltipPreviewAtlasLoaded,
  ensurePinnedTooltipPreviewAtlasLoaded,
  loadAllCatsAtlas
} = createPreviewManager({
  tooltipPreviewEl,
  pinnedTooltipPreviewEl,
  detailPreviewEl: catDetailsPreviewEl,
  getHoveredId: () => hoveredId,
  getPinnedId: () => pinnedCatId,
  getDetailId: () => catDetailsDialogId,
  isTooltipPreviewEnabled: () => hoverPreviewImagesEnabled
});
const moonCatDetailsLoader = createMoonCatDetailsLoader();

const {
  triFaceSlots,
  triFaceTexturePromises,
  triTextureStats,
  setBaseMaterialMode,
  makeTriacontahedron,
  loadTriFaceSlotMetadata,
  getRescueTargetData
} = createCatMoonGeometry({
  textureLoader,
  applyTextureSettings,
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

function updateHudHelpState() {
  hudHelpPanel.hidden = !hudHelpOpen;
  hudHelpButton.setAttribute("aria-expanded", hudHelpOpen ? "true" : "false");
  const label = hudHelpOpen ? "Hide help" : "Show help";
  hudHelpButton.setAttribute("aria-label", label);
  hudHelpButton.title = label;
}

function collapseHudAfterMobileRescueLookup() {
  if (!hudUnlocked || !(window.matchMedia?.(MOBILE_HUD_MEDIA_QUERY)?.matches ?? false)) return;

  hudUnlocked = false;
  hudHelpOpen = false;
  updateHudHelpState();
  updateHudLockState();
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
  pinnedTooltipEl.classList.toggle("image-off", !hoverPreviewImagesEnabled);
  updateCatLinksToggleUi();
  if (!hoverPreviewImagesEnabled) {
    updateTooltipPreview(null);
    updatePinnedTooltipPreview(null);
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

function loadCatLinksSetting() {
  try {
    return window.localStorage.getItem(CAT_LINKS_STORAGE_KEY) !== "off";
  } catch (error) {
    return true;
  }
}

function saveCatLinksSetting(enabled) {
  try {
    window.localStorage.setItem(CAT_LINKS_STORAGE_KEY, enabled ? "on" : "off");
  } catch (error) {
    // The setting still persists for this page session through in-memory state.
  }
}

function updateCatLinksToggleUi() {
  catLinksToggleEl.checked = catLinksEnabled;
  const detailsEnabled = catLinksEnabled && hoverPreviewImagesEnabled && pinnedCatId !== null;
  pinnedTooltipEl.classList.toggle("details-enabled", detailsEnabled);
  pinnedTooltipPreviewEl.tabIndex = detailsEnabled ? 0 : -1;
  pinnedTooltipPreviewEl.setAttribute("aria-disabled", detailsEnabled ? "false" : "true");
  if (!detailsEnabled) closeCatDetailsDialog();
}

function loadEarlyRescueZoneSetting() {
  try {
    return window.localStorage.getItem(EARLY_RESCUE_ZONE_STORAGE_KEY) === "on";
  } catch (error) {
    return false;
  }
}

function saveEarlyRescueZoneSetting(enabled) {
  try {
    window.localStorage.setItem(EARLY_RESCUE_ZONE_STORAGE_KEY, enabled ? "on" : "off");
  } catch (error) {
    // The setting still persists for this page session through in-memory state.
  }
}

function updateEarlyRescueZoneAppearance() {
  if (!triacontahedron?.userData) return;

  const shouldShow = earlyRescueZoneEnabled && EARLY_RESCUE_ZONE_VISIBLE_FILTERS.has(activeFilter);
  for (const mesh of triacontahedron.userData.earlyRescueZoneMeshes || []) {
    mesh.visible = shouldShow;
  }
}

function updateEarlyRescueZoneToggleUi() {
  earlyRescueZoneToggleEl.checked = earlyRescueZoneEnabled;
  updateEarlyRescueZoneAppearance();
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

function clearHoverIntentTimer() {
  if (hoverIntentTimer !== null) {
    window.clearTimeout(hoverIntentTimer);
    hoverIntentTimer = null;
  }
}

function clearTransientHover({ clearPointer = false } = {}) {
  clearHoverIntentTimer();
  if (clearPointer) {
    pointerInside = false;
  }
  setHoveredId(null);
}

function suppressTransientHover(cooldownMs = 0) {
  clearHoverIntentTimer();
  if (cooldownMs > 0) {
    transientHoverSuppressedUntil = Math.max(transientHoverSuppressedUntil, performance.now() + cooldownMs);
  }
  setHoveredId(null);
}

function isTransientHoverSuppressed() {
  return performance.now() < transientHoverSuppressedUntil;
}

function updateHoverFromPointerAfterIntent() {
  hoverIntentTimer = null;
  if (isTransientHoverSuppressed()) {
    setHoveredId(null);
    return;
  }
  updateHoverFromPointer();
}

function positionTooltipElement(tooltipElement, anchorX, anchorY) {
  const offset = 16;
  const margin = 8;
  tooltipElement.style.display = "block";

  const rect = tooltipElement.getBoundingClientRect();
  const left = anchorX - rect.width - offset;
  const top = anchorY - rect.height - offset;

  tooltipElement.style.left = `${clamp(left, margin, Math.max(margin, window.innerWidth - rect.width - margin))}px`;
  tooltipElement.style.top = `${clamp(top, margin, Math.max(margin, window.innerHeight - rect.height - margin))}px`;
  tooltipElement.setAttribute("aria-hidden", "false");
}

function positionTooltip() {
  positionTooltipElement(tooltipEl, lastClientX, lastClientY);
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

function updateTooltipLabel(labelEl, id) {
  labelEl.replaceChildren();
  if (id === null) return;

  const idEl = document.createElement("div");
  idEl.className = "tooltipCatId";
  idEl.textContent = `${id}`;
  labelEl.append(idEl);

  const name = moonCatNames?.[id];
  if (typeof name === "string" && name) {
    const nameEl = document.createElement("div");
    nameEl.className = "tooltipCatName";
    nameEl.textContent = name;
    labelEl.append(nameEl);
  }
}

function ensureMoonCatNamesLoaded(id) {
  if (id === null || moonCatNames || moonCatNamesLoadFailed) return;

  loadMoonCatNames().then((names) => {
    if (!names) return;
    if (hoveredId === id && pinnedCatId === null) {
      updateTooltipLabel(tooltipLabelEl, id);
      positionTooltip();
    }
    if (pinnedCatId === id) {
      updateTooltipLabel(pinnedTooltipLabelEl, id);
      positionTooltipElement(pinnedTooltipEl, pinnedTooltipAnchorX, pinnedTooltipAnchorY);
    }
    if (catDetailsDialogEl.open && catDetailsDialogId === id) {
      updateCatDetailsTitle(id);
    }
  });
}

function setHoveredId(id) {
  hoveredId = id;

  if (pinnedCatId !== null) {
    hideTooltip();
    updateTooltipPreview(null);
    return;
  }

  updateTooltipPreview(id);
  ensureTooltipPreviewAtlasLoaded();

  if (id === null) {
    hideTooltip();
    return;
  }

  updateTooltipLabel(tooltipLabelEl, id);
  positionTooltip();
  ensureMoonCatNamesLoaded(id);
  scheduleTooltipHide();
}

function updateHoverFromPointer() {
  if (!activeObject || !pointerInside) {
    setHoveredId(null);
    return;
  }
  if (isTransientHoverSuppressed()) {
    setHoveredId(null);
    return;
  }

  const catHit = getCatHitFromPointer();
  setHoveredId(catHit?.id ?? null);
}

function getCatHitFromPointer() {
  if (!activeObject) return null;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(activeObject, true);
  if (!hits.length) return null;

  const hit = hits[0];
  const id = idFromTriacontahedronHit(hit);
  if (id === null) return null;

  return {
    id,
    localPoint: activeObject.worldToLocal(hit.point.clone())
  };
}

function updateHoverFromClient(clientX, clientY) {
  pointerInside = true;
  lastClientX = clientX;
  lastClientY = clientY;
  updatePointerFromClient(clientX, clientY);
  clearHoverIntentTimer();
  if (isTransientHoverSuppressed()) {
    setHoveredId(null);
    return hoveredId;
  }

  hoverIntentTimer = window.setTimeout(updateHoverFromPointerAfterIntent, HOVER_INTENT_DELAY_MS);
  return hoveredId;
}

function hidePinnedTooltip() {
  closeCatDetailsDialog();
  pinnedCatId = null;
  pinnedCatLocalPoint = null;
  updatePinnedTooltipPreview(null);
  pinnedTooltipEl.style.display = "none";
  pinnedTooltipEl.setAttribute("aria-hidden", "true");
  updateCatLinksToggleUi();
}

function showPinnedTooltip(id, clientX, clientY, localPoint) {
  if (catDetailsDialogEl.open && catDetailsDialogId !== id) closeCatDetailsDialog();
  pinnedCatId = id;
  pinnedTooltipAnchorX = clientX;
  pinnedTooltipAnchorY = clientY;
  pinnedCatLocalPoint = localPoint.clone();
  updatePinnedTooltipPreview(id);
  ensurePinnedTooltipPreviewAtlasLoaded();
  updateTooltipLabel(pinnedTooltipLabelEl, id);
  positionTooltipElement(pinnedTooltipEl, pinnedTooltipAnchorX, pinnedTooltipAnchorY);
  ensureMoonCatNamesLoaded(id);
  updateCatLinksToggleUi();
}

const CAT_DETAIL_LABELS = Object.freeze({
  rescueOrder: "Rescue order",
  rescueYear: "Rescue year",
  catId: "Cat ID",
  hueInt: "Hue",
  hueName: "Hue name",
  pale: "Pale",
  facing: "Facing",
  expression: "Expression",
  pattern: "Pattern",
  pose: "Pose"
});
const CAT_DETAIL_FIELD_ORDER = Object.freeze([
  "rescueYear",
  "catId",
  "hueInt",
  "hueName",
  "pale",
  "facing",
  "expression",
  "pattern",
  "pose"
]);

function updateCatDetailsTitle(id) {
  const name = moonCatNames?.[id];
  catDetailsTitleEl.textContent = typeof name === "string" && name
    ? `MoonCat #${id} — ${name}`
    : `MoonCat #${id}`;
}

function setCatDetailsStatus(message, isError = false) {
  catDetailsStatusEl.textContent = message;
  catDetailsStatusEl.classList.toggle("error", isError);
}

function renderCatDetails(detail) {
  catDetailsTraitsEl.replaceChildren();
  for (const field of CAT_DETAIL_FIELD_ORDER) {
    const term = document.createElement("dt");
    term.textContent = CAT_DETAIL_LABELS[field];
    const definition = document.createElement("dd");
    definition.textContent = field === "pale" ? (detail.pale ? "Yes" : "No") : `${detail[field]}`;
    if (field === "catId") definition.className = "catDetailsCatId";
    catDetailsTraitsEl.append(term, definition);
  }
}

function loadCatDetailsForDialog(id) {
  const requestToken = catDetailsRequestToken + 1;
  catDetailsRequestToken = requestToken;
  catDetailsTraitsEl.replaceChildren();
  catDetailsRetryEl.hidden = true;
  setCatDetailsStatus("Loading MoonCat details…");

  moonCatDetailsLoader.load(id).then((detail) => {
    if (!catDetailsDialogEl.open || catDetailsDialogId !== id || pinnedCatId !== id || requestToken !== catDetailsRequestToken) return;
    renderCatDetails(detail);
    setCatDetailsStatus("");
  }).catch((error) => {
    if (!catDetailsDialogEl.open || catDetailsDialogId !== id || requestToken !== catDetailsRequestToken) return;
    console.warn(`Could not load MoonCat details for ${id}.`, error);
    setCatDetailsStatus("Could not load traits. Links and preview are still available.", true);
    catDetailsRetryEl.hidden = false;
  });
}

function openCatDetailsDialog() {
  if (!catLinksEnabled || !hoverPreviewImagesEnabled || pinnedCatId === null) return;

  const id = pinnedCatId;
  catDetailsDialogId = id;
  updateCatDetailsTitle(id);
  const links = moonCatDetailLinks(id);
  catDetailsChainStationEl.href = links.chainStation;
  catDetailsOpenSeaEl.href = links.openSea;
  updateDetailPreview(id);
  loadAllCatsAtlas().then(() => {
    if (catDetailsDialogEl.open && catDetailsDialogId === id) updateDetailPreview(id);
  }).catch((error) => {
    console.warn("Could not load the MoonCat detail preview atlas.", error);
  });

  if (!catDetailsDialogEl.open) catDetailsDialogEl.showModal();
  loadCatDetailsForDialog(id);
  ensureMoonCatNamesLoaded(id);
}

function closeCatDetailsDialog() {
  catDetailsRequestToken += 1;
  catDetailsDialogId = null;
  if (catDetailsDialogEl.open) catDetailsDialogEl.close();
}

function togglePinnedCatFromClient(clientX, clientY) {
  cancelFocusAnimation();
  pointerInside = true;
  lastClientX = clientX;
  lastClientY = clientY;
  updatePointerFromClient(clientX, clientY);
  const catHit = getCatHitFromPointer();
  if (!catHit) return;

  if (pinnedCatId === catHit.id) {
    hidePinnedTooltip();
    return;
  }

  showPinnedTooltip(catHit.id, clientX, clientY, catHit.localPoint);
}

function updatePinnedTooltipProjection() {
  if (pinnedCatId === null || !pinnedCatLocalPoint || !activeObject) return;

  const projected = activeObject.localToWorld(pinnedCatLocalPoint.clone()).project(camera);
  if (
    projected.z < -1
    || projected.z > 1
    || !Number.isFinite(projected.x)
    || !Number.isFinite(projected.y)
  ) {
    hidePinnedTooltip();
    return;
  }

  const screenX = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const screenY = (-projected.y * 0.5 + 0.5) * window.innerHeight;
  const distance = Math.hypot(screenX - pinnedTooltipAnchorX, screenY - pinnedTooltipAnchorY);
  if (
    distance > PINNED_TOOLTIP_DRIFT_LIMIT_PX
    || screenX < 0
    || screenX > window.innerWidth
    || screenY < 0
    || screenY > window.innerHeight
  ) {
    hidePinnedTooltip();
  }
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

function setRescueLookupStatus(message = "", isError = false) {
  rescueLookupStatusEl.textContent = message;
  rescueLookupStatusEl.classList.toggle("error", isError);
}

function getFocusTargetQuaternion(normal, up) {
  const desiredNormal = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1).normalize();
  const targetUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).projectOnPlane(desiredNormal);
  if (targetUp.lengthSq() < 0.000001) {
    targetUp.set(0, 1, 0).projectOnPlane(desiredNormal);
  }
  if (targetUp.lengthSq() < 0.000001) {
    targetUp.set(0, 0, 1).projectOnPlane(desiredNormal);
  }
  targetUp.normalize();

  const targetUpForCat = up.clone().projectOnPlane(normal).normalize();
  const targetRightForCat = targetUpForCat.clone().cross(normal).normalize();
  const desiredRight = targetUp.clone().cross(desiredNormal).normalize();
  if (targetUpForCat.lengthSq() < 0.000001 || targetRightForCat.lengthSq() < 0.000001 || desiredRight.lengthSq() < 0.000001) {
    return null;
  }

  const canonicalBasis = new THREE.Matrix4().makeBasis(targetRightForCat, targetUpForCat, normal);
  const targetBasis = new THREE.Matrix4().makeBasis(desiredRight, targetUp, desiredNormal);
  const canonicalQuaternion = new THREE.Quaternion().setFromRotationMatrix(canonicalBasis);
  const targetBasisQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetBasis);
  return targetBasisQuaternion.multiply(canonicalQuaternion.invert()).normalize();
}

function focusRescueId() {
  const id = parseRescueId(rescueLookupInputEl.value);
  if (id === null) {
    setRescueLookupStatus(`Enter a whole Rescue ID from 0 to ${MAX_ID}.`, true);
    return;
  }
  if (!triacontahedron || !activeObject || controlsApi?.hasActiveInput()) {
    setRescueLookupStatus("CatMoon is still loading.", true);
    return;
  }

  const target = getRescueTargetData(id, triacontahedron);
  if (!target) {
    setRescueLookupStatus("That Rescue ID is unavailable right now.", true);
    return;
  }

  const targetQuaternion = getFocusTargetQuaternion(target.normal, target.up);
  if (!targetQuaternion) {
    setRescueLookupStatus("That Rescue ID could not be focused.", true);
    return;
  }

  focusInteractionVersion += 1;
  cancelFocusAnimation();
  const targetDistance = clamp(RESCUE_LOOKUP_TARGET_DISTANCE, TRI_MIN_DISTANCE, TRI_MAX_DISTANCE);
  const startCameraPosition = camera.position.clone();
  const targetCameraPosition = camera.position.clone().setLength(targetDistance);
  focusAnimation = {
    startTime: performance.now(),
    duration: FILTER_FOCUS_DURATION_MS,
    startQuaternion: triacontahedron.quaternion.clone(),
    targetQuaternion,
    startCameraPosition,
    targetCameraPosition,
    onComplete() {
      pauseAutoRotate();
      showPinnedTooltip(id, window.innerWidth / 2, window.innerHeight / 2, target.localPoint);
      collapseHudAfterMobileRescueLookup();
    }
  };
  setRescueLookupStatus("");
  pauseAutoRotate();
}

function focusFace(faceIndex) {
  if (!triacontahedron || controlsApi?.hasActiveInput()) return;

  const faceNormal = triacontahedron.userData.faceNormals?.[faceIndex];
  const faceUp = triacontahedron.userData.faceUps?.[faceIndex];
  if (!faceNormal || !faceUp) return;

  const targetQuaternion = getFocusTargetQuaternion(faceNormal, faceUp);
  if (!targetQuaternion) return;

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
  if (focusAnimation.startCameraPosition) {
    camera.position.copy(focusAnimation.startCameraPosition).lerp(focusAnimation.targetCameraPosition, eased);
    camera.lookAt(0, 0, 0);
  }

  if (t >= 1) {
    const completedAnimation = focusAnimation;
    focusAnimation = null;
    if (completedAnimation.onComplete) {
      completedAnimation.onComplete();
    } else {
      scheduleAutoRotateResume();
    }
  }
}

function applyAutoRotate(deltaSeconds) {
  if (!AUTO_ROTATE_ENABLED || !autoTumbleEnabled || pinnedCatId !== null || !activeObject) return;
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
  rendering.resize(width, height);
  afterimage?.resize(width, height);
  depthOfField?.resize(width, height);
  backgroundController.resize({
    viewportWidth: width,
    coarsePointer: window.matchMedia?.("(pointer: coarse)")?.matches ?? false
  });
  performanceMonitor.resize();
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
  updatePinnedTooltipProjection();
  applyAutoRotate(deltaSeconds);
  updateStarParallax();
  backgroundController.update({
    cameraQuaternion: camera.quaternion,
    moonQuaternion: activeObject?.quaternion,
    deltaSeconds
  });
  if (modeUsesAfterimage(renderMode)) {
    ensureAfterimage().render();
  } else if (modeUsesDepthOfField(renderMode)) {
    ensureDepthOfField().render();
  } else {
    rendering.render(scene, camera);
  }
  performanceMonitor.update(now, renderer);
}

function disposeTexture(texture) {
  if (!texture) return;
  texture.dispose();
}

function clearCachedOverlayTextures(filterKey) {
  const textures = filterTextureCache.get(filterKey);
  if (!textures) return;

  for (const texture of textures) {
    textureManager.unregisterTexture(texture);
    disposeTexture(texture);
  }
  filterTextureCache.delete(filterKey);
}

function clearWalletOverlayTextures() {
  clearCachedOverlayTextures(WALLET_FILTER_KEY);
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

function drawCatFromAtlas(context, atlasImage, id, destRect, scale = 1) {
  const srcCol = id % COLS;
  const srcRow = Math.floor(id / COLS);
  const centerX = destRect.x + destRect.w / 2;
  const centerY = destRect.y + destRect.h / 2;
  const scaledW = destRect.w * scale;
  const scaledH = destRect.h * scale;
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

function groupIdsByFace(ids) {
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

function makeIdOverlayTexture(atlasImage, faceIndex, slotIds, { scale = 1 } = {}) {
  const faceCanvas = document.createElement("canvas");
  faceCanvas.width = TRI_FACE_TEX_W;
  faceCanvas.height = TRI_FACE_TEX_H;

  const context = faceCanvas.getContext("2d");
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, faceCanvas.width, faceCanvas.height);

  const slots = triFaceSlots[faceIndex] || [];
  for (const slot of slots) {
    if (!slotIds.has(slot.id) || !slot.hitRect) continue;
    drawCatFromAtlas(context, atlasImage, faceIndex * RHOMBUS_CAT_COUNT + slot.id, slot.hitRect, scale);
  }

  return applyTextureSettings(new THREE.CanvasTexture(faceCanvas));
}

function makeIdOverlayTextures(atlasImage, ids, options = {}) {
  const textures = Array(TRI_FACE_COUNT).fill(null);
  const idsByFace = groupIdsByFace(ids);

  for (const [faceIndex, slotIds] of idsByFace) {
    if (!slotIds.size) continue;
    textures[faceIndex] = makeIdOverlayTexture(atlasImage, faceIndex, slotIds, options);
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

function formatFilterCount(count) {
  return Number.isInteger(count) ? count.toLocaleString("en-US") : "";
}

function activeFilterCount() {
  if (activeFilter === "all") {
    return activeFilterCounts?.all ?? MAX_ID + 1;
  }
  if (activeFilter === WALLET_FILTER_KEY) {
    return walletFilterIds.length || activeFilterSet?.size || lastWalletLookup?.count || null;
  }
  if (Number.isInteger(activeFilterCounts?.[activeFilter])) {
    return activeFilterCounts[activeFilter];
  }
  if (activeFilterSet instanceof Set) {
    return activeFilterSet.size;
  }
  return null;
}

function activeFilterDisplayText() {
  const label = filterDisplayName(activeFilter);
  const count = activeFilterCount();
  const formattedCount = formatFilterCount(count);
  return formattedCount ? `${label} (${formattedCount})` : label;
}

function activeFilterBadgeParts() {
  if (activeFilter !== WALLET_FILTER_KEY) {
    return { text: activeFilterDisplayText(), walletName: "", walletSuffix: "" };
  }

  const formattedCount = formatFilterCount(activeFilterCount());
  const suffix = formattedCount ? `${WALLET_FILTER_LABEL} (${formattedCount})` : WALLET_FILTER_LABEL;
  return {
    text: walletFilterLabel ? `${walletFilterLabel} ${suffix}` : suffix,
    walletName: walletFilterLabel,
    walletSuffix: suffix
  };
}

function updateActiveFilterStat() {
  const text = activeFilterDisplayText();
  activeFilterStatEl.textContent = text;
  activeFilterStatEl.title = text;
}

async function ensureRuntimeFilterOverlayTextures(filterKey, ids, token) {
  if (filterTextureCache.has(filterKey)) return;

  const atlasImage = await loadAllCatsAtlas();
  if (token !== filterSelectionToken) return;

  clearCachedOverlayTextures(filterKey);
  filterTextureCache.set(filterKey, makeIdOverlayTextures(atlasImage, ids));
}

function updateActiveFilterBadge() {
  updateActiveFilterStat();
  const isFiltered = activeFilter !== "all";
  activeFilterBadgeEl.hidden = !isFiltered;
  if (isFiltered) {
    const badgeParts = activeFilterBadgeParts();
    activeFilterNameEl.classList.toggle("walletFilterName", activeFilter === WALLET_FILTER_KEY);
    if (activeFilter === WALLET_FILTER_KEY && badgeParts.walletName) {
      const walletNameEl = document.createElement("span");
      walletNameEl.className = "activeFilterWalletName";
      walletNameEl.textContent = badgeParts.walletName;
      const walletSuffixEl = document.createElement("span");
      walletSuffixEl.className = "activeFilterWalletSuffix";
      walletSuffixEl.textContent = badgeParts.walletSuffix;
      activeFilterNameEl.replaceChildren(walletNameEl, " ", walletSuffixEl);
    } else {
      activeFilterNameEl.textContent = badgeParts.text;
    }
    activeFilterBadgeEl.setAttribute("aria-label", `${badgeParts.text} active. Reset filter.`);
    activeFilterBadgeEl.title = `Reset ${badgeParts.text}`;
  } else {
    activeFilterNameEl.textContent = "";
    activeFilterNameEl.classList.remove("walletFilterName");
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

  const shouldShowEarlyRescueZone = earlyRescueZoneEnabled && EARLY_RESCUE_ZONE_VISIBLE_FILTERS.has(activeFilter);
  for (const mesh of triacontahedron.userData.earlyRescueZoneMeshes || []) {
    mesh.visible = shouldShowEarlyRescueZone;
  }
}

async function setActiveFilter(filterKey, { focus = false, updateUrl = true } = {}) {
  focusInteractionVersion += 1;
  cancelFocusAnimation();
  scheduleAutoRotateResume();
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
    activeFilterCounts = await ensureFilterCountsLoaded();
    if (token !== filterSelectionToken) return;
    if (!(filterSets[nextFilter] instanceof Set)) {
      throw new Error(`${filterDisplayName(nextFilter)} is unavailable.`);
    }

    activeFilter = nextFilter;
    activeFilterSet = filterSets[nextFilter];
    updateFilterAppearance();
    updateHoverFromPointer();
    const isSetOnlyFilter = SET_ONLY_FILTER_KEYS.has(nextFilter);
    if (focus && !isSetOnlyFilter) {
      focusFilterFace(nextFilter, token, focusInteractionVersion);
    }

    if (isSetOnlyFilter) {
      await ensureRuntimeFilterOverlayTextures(nextFilter, Array.from(activeFilterSet), token);
      if (token !== filterSelectionToken) return;
      updateFilterAppearance();
      updateHoverFromPointer();
      return;
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
    statusEl.textContent = error.message || `${filterDisplayName(nextFilter)} filter unavailable.`;
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

  const walletTextures = makeIdOverlayTextures(atlasImage, walletRecord.ids, { scale: WALLET_CAT_SCALE });
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
  statusEl.textContent = `Drag to tumble, scroll/pinch zoom, twist or Ctrl/Alt-drag, right click-drag to roll, click/press to pin.`;
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
  if (!hudUnlocked) {
    hudHelpOpen = false;
    updateHudHelpState();
  }
  updateHudLockState();
  if (hudUnlocked) {
    preloadFilterOverlayTextures();
    setHoveredId(hoveredId);
  }
});
updateHudLockState();
updateHudHelpState();
updateHoverPreviewToggleUi();
updateAutoTumbleToggleUi();
updateCatLinksToggleUi();
updateEarlyRescueZoneToggleUi();
updateHybridStarfieldToggleUi();
updatePerformanceMonitorToggleUi();
updateRenderModeUi();
walletLookupHistory = loadWalletLookupHistory();
updateWalletLookupHistoryUi();
const initialWalletParam = getWalletParamFromUrl();
if (initialWalletParam) {
  walletFilterInputEl.value = initialWalletParam;
}
updateWalletClearButton();

hudHelpButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  hudHelpOpen = !hudHelpOpen;
  updateHudHelpState();
});

catFilterEl.addEventListener("change", () => {
  setActiveFilter(catFilterEl.value, { focus: catFilterEl.value !== "all" });
});

hoverPreviewToggleEl.addEventListener("change", () => {
  hoverPreviewImagesEnabled = hoverPreviewToggleEl.checked;
  saveHoverPreviewImageSetting(hoverPreviewImagesEnabled);
  updateHoverPreviewToggleUi();
  setHoveredId(hoveredId);
  if (pinnedCatId !== null) {
    updatePinnedTooltipPreview(pinnedCatId);
    ensurePinnedTooltipPreviewAtlasLoaded();
    positionTooltipElement(pinnedTooltipEl, pinnedTooltipAnchorX, pinnedTooltipAnchorY);
  }
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

catLinksToggleEl.addEventListener("change", () => {
  catLinksEnabled = catLinksToggleEl.checked;
  saveCatLinksSetting(catLinksEnabled);
  updateCatLinksToggleUi();
});

earlyRescueZoneToggleEl.addEventListener("change", () => {
  earlyRescueZoneEnabled = earlyRescueZoneToggleEl.checked;
  saveEarlyRescueZoneSetting(earlyRescueZoneEnabled);
  updateEarlyRescueZoneAppearance();
});

hybridStarfieldToggleEl.addEventListener("change", () => {
  hybridStarfieldEnabled = hybridStarfieldToggleEl.checked;
  saveHybridStarfieldEnabledSetting(hybridStarfieldEnabled);
  backgroundController.setEnabled(hybridStarfieldEnabled);
  updateHybridStarfieldToggleUi();
});

performanceMonitorToggleEl.addEventListener("change", () => {
  performanceMonitorEnabled = performanceMonitorToggleEl.checked;
  savePerformanceMonitorEnabledSetting(performanceMonitorEnabled);
  performanceMonitor.setEnabled(performanceMonitorEnabled);
  performanceMonitor.resize();
  updatePerformanceMonitorToggleUi();
});

renderModeSelectEl.addEventListener("change", () => {
  renderMode = textureManager.setMode(renderModeSelectEl.value);
  updatePostProcessingModes();
  updateLitMoonMode();
  saveRenderModeSetting(renderMode);
  updateRenderModeUi();
});

for (const [key, control] of Object.entries(depthOfFieldControls)) {
  control.input.addEventListener("input", () => {
    updateDepthOfFieldSettings({
      [key]: clampDepthOfFieldValue(key, control.input.value)
    });
  });
}

depthOfFieldResetEl.addEventListener("click", () => {
  updateDepthOfFieldSettings({ ...DEPTH_OF_FIELD_DEFAULTS });
});

rescueLookupButtonEl.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  focusRescueId();
});

rescueLookupInputEl.addEventListener("input", () => {
  setRescueLookupStatus("");
});

rescueLookupInputEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  focusRescueId();
});

pinnedTooltipPreviewEl.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

pinnedTooltipPreviewEl.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  openCatDetailsDialog();
});

pinnedTooltipPreviewEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openCatDetailsDialog();
});

catDetailsCloseEl.addEventListener("click", () => {
  closeCatDetailsDialog();
});

catDetailsRetryEl.addEventListener("click", () => {
  if (catDetailsDialogId !== null) loadCatDetailsForDialog(catDetailsDialogId);
});

catDetailsDialogEl.addEventListener("click", (event) => {
  if (event.target === catDetailsDialogEl) closeCatDetailsDialog();
});

catDetailsDialogEl.addEventListener("close", () => {
  catDetailsRequestToken += 1;
  catDetailsDialogId = null;
  if (pinnedCatId !== null && !pinnedTooltipEl.classList.contains("image-off")) {
    pinnedTooltipPreviewEl.focus();
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

renderer.domElement.addEventListener("wheel", () => {
  if (!focusAnimation) return;
  focusInteractionVersion += 1;
  cancelFocusAnimation();
  pauseAutoRotate();
  scheduleAutoRotateResume();
}, { capture: true, passive: true });

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
  clearHover: () => clearTransientHover({ clearPointer: true }),
  suppressTransientHover,
  touchHoverCooldownMs: TOUCH_HOVER_COOLDOWN_MS,
  activateCatAtClient: togglePinnedCatFromClient,
  pauseAutoRotate,
  scheduleAutoRotateResume,
  cancelFocusAnimation,
  incrementFocusInteractionVersion: () => {
    focusInteractionVersion += 1;
  }
});

window.addEventListener("resize", resize);
resize();
updatePostProcessingModes();
updateLitMoonMode();
