import {
  ALL_CATS_ATLAS_URL,
  ATLAS_H,
  ATLAS_W,
  COLS,
  PREVIEW_SCALE,
  TILE_H,
  TILE_W
} from "./config.js";

function clearPreviewElement(previewEl) {
  previewEl.style.backgroundPosition = "9999px 9999px";
}

function updatePreviewElement(previewEl, id, scale = PREVIEW_SCALE) {
  if (id === null) {
    clearPreviewElement(previewEl);
    return;
  }

  const row = Math.floor(id / COLS);
  const col = id % COLS;
  previewEl.style.backgroundSize = `${ATLAS_W * scale}px ${ATLAS_H * scale}px`;
  previewEl.style.backgroundPosition = `${-(col * TILE_W * scale)}px ${-(row * TILE_H * scale)}px`;
}

export function createPreviewManager({
  tooltipPreviewEl,
  pinnedTooltipPreviewEl,
  getHoveredId,
  getPinnedId,
  isTooltipPreviewEnabled
}) {
  let allCatsAtlasImage = null;
  let allCatsAtlasPromise = null;

  function updateCardPreview(previewEl, id) {
    if (!previewEl) return;
    if (!isTooltipPreviewEnabled() || !allCatsAtlasImage) {
      clearPreviewElement(previewEl);
      return;
    }

    updatePreviewElement(previewEl, id, PREVIEW_SCALE);
  }

  function updateTooltipPreview(id) {
    updateCardPreview(tooltipPreviewEl, id);
  }

  function updatePinnedTooltipPreview(id) {
    updateCardPreview(pinnedTooltipPreviewEl, id);
  }

  function applyCachedPreviewAtlas() {
    if (!allCatsAtlasImage) return;

    if (tooltipPreviewEl) {
      tooltipPreviewEl.style.backgroundImage = `url("${ALL_CATS_ATLAS_URL}")`;
    }
    if (pinnedTooltipPreviewEl) {
      pinnedTooltipPreviewEl.style.backgroundImage = `url("${ALL_CATS_ATLAS_URL}")`;
    }
    updateTooltipPreview(getHoveredId());
    updatePinnedTooltipPreview(getPinnedId());
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

  function ensureTooltipPreviewAtlasLoaded() {
    if (!isTooltipPreviewEnabled() || getHoveredId() === null || allCatsAtlasImage) return;

    loadAllCatsAtlas().catch((error) => {
      console.warn("Could not load CatMoon hover preview atlas.", error);
    });
  }

  function ensurePinnedTooltipPreviewAtlasLoaded() {
    if (!isTooltipPreviewEnabled() || getPinnedId() === null || allCatsAtlasImage) return;

    loadAllCatsAtlas().catch((error) => {
      console.warn("Could not load CatMoon pinned preview atlas.", error);
    });
  }

  return {
    updateTooltipPreview,
    updatePinnedTooltipPreview,
    applyCachedPreviewAtlas,
    ensureTooltipPreviewAtlasLoaded,
    ensurePinnedTooltipPreviewAtlasLoaded,
    loadAllCatsAtlas
  };
}
