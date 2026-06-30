import {
  FILTER_DATA_URL,
  FILTER_DEFINITIONS,
  FILTER_MANIFEST_URL,
  PRELOAD_FILTER_KEYS,
  TRI_FACE_COUNT,
  TRI_FACE_TEX_H,
  TRI_FACE_TEX_W,
  filterTextureUrl
} from "./config.js";

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

function validateFilterManifest(manifest) {
  return manifest
    && manifest.version === 1
    && manifest.filters
    && typeof manifest.filters === "object";
}

export function createFilterManager({ textureLoader, applyPixelTextureSettings }) {
  let filterDataPromise = null;
  let filterManifestPromise = null;
  let filterOverlayPreloadStarted = false;
  const filterTexturePromises = new Map();
  const filterTextureCache = new Map();

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

  return {
    filterTextureCache,
    ensureFilterDataLoaded,
    ensureFilterManifestLoaded,
    ensureFilterTexturesLoaded,
    preloadFilterOverlayTextures,
    filterManifestFaces
  };
}
