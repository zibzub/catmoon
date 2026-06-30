import {
  ALL_CATS_ATLAS_URL,
  ATLAS_H,
  ATLAS_W,
  COLS,
  PREVIEW_SCALE,
  TILE_H,
  TILE_W
} from "./config.js";

export function createPreviewManager({ previewEl, getHoveredId, isHudUnlocked }) {
  let allCatsAtlasImage = null;
  let allCatsAtlasPromise = null;

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
    updatePreview(getHoveredId());
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

  function ensurePreviewAtlasLoaded() {
    if (!isHudUnlocked() || getHoveredId() === null || allCatsAtlasImage) return;

    loadAllCatsAtlas().catch((error) => {
      console.warn("Could not load CatMoon preview atlas.", error);
    });
  }

  return {
    updatePreview,
    applyCachedPreviewAtlas,
    ensurePreviewAtlasLoaded,
    loadAllCatsAtlas
  };
}
