import {
  FILTER_DATA_URL,
  FILTER_DEFINITIONS,
  FILTER_MANIFEST_URL,
  MOONCAT_NAMES_URL,
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
  if (definition.names) {
    if (!filters.names || typeof filters.names !== "object") {
      throw new Error(`${MOONCAT_NAMES_URL} is missing or invalid`);
    }
    return new Set(Object.keys(filters.names).map((id) => Number(id)).filter(Number.isInteger));
  }
  if (definition.key === "characters" && Array.isArray(filters.presets?.characters?.ids)) {
    return new Set(filters.presets.characters.ids);
  }
  if (definition.category) {
    return categoryIdSet(filters, definition.category);
  }
  return unionCategoryIdSet(filters, definition.categories);
}

function categoryCount(filters, key) {
  const category = filters.categories?.[key];
  if (!category) {
    throw new Error(`${FILTER_DATA_URL} is missing categories.${key}`);
  }
  if (Number.isInteger(category.count)) {
    return category.count;
  }
  if (Array.isArray(category.ids)) {
    return category.ids.length;
  }
  throw new Error(`${FILTER_DATA_URL} is missing categories.${key}.ids`);
}

function filterDefinitionCount(filters, definition, idSet) {
  if (definition.names) {
    return filters.names && typeof filters.names === "object"
      ? Object.keys(filters.names).length
      : null;
  }
  if (definition.key === "characters" && Number.isInteger(filters.presets?.characters?.count)) {
    return filters.presets.characters.count;
  }
  if (definition.category) {
    return categoryCount(filters, definition.category);
  }
  return idSet instanceof Set ? idSet.size : null;
}

function validateFilterManifest(manifest) {
  return manifest
    && manifest.version === 1
    && manifest.filters
    && typeof manifest.filters === "object";
}

export function createFilterManager({ textureLoader, applyPixelTextureSettings }) {
  let filterDataPromise = null;
  let filterCountsPromise = null;
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
    try {
      const namesResponse = await fetch(MOONCAT_NAMES_URL, { cache: "no-cache" });
      if (!namesResponse.ok) {
        throw new Error(`HTTP ${namesResponse.status}`);
      }
      filters.names = await namesResponse.json();
    } catch (error) {
      filters.namesError = error;
      console.warn(`Could not load ${MOONCAT_NAMES_URL}; Named Cats filter will be unavailable.`, error);
    }

    const filterSets = {};
    const filterCounts = {};
    for (const definition of FILTER_DEFINITIONS) {
      if (definition.names && filters.namesError) {
        filterSets[definition.key] = null;
        filterCounts[definition.key] = null;
        continue;
      }
      const idSet = filterDefinitionIdSet(filters, definition);
      filterSets[definition.key] = idSet;
      filterCounts[definition.key] = filterDefinitionCount(filters, definition, idSet);
    }
    if (Number.isInteger(filters.presets?.all?.count)) {
      filterCounts.all = filters.presets.all.count;
    } else if (Number.isInteger(filters.catCount)) {
      filterCounts.all = filters.catCount;
    }
    return { filterSets, filterCounts };
  }

  function ensureFilterDataLoaded() {
    if (!filterDataPromise) {
      filterDataPromise = loadFilterData();
    }
    return filterDataPromise.then(({ filterSets }) => filterSets);
  }

  function ensureFilterCountsLoaded() {
    if (!filterCountsPromise) {
      filterCountsPromise = ensureFilterDataLoaded().then(() => filterDataPromise.then(({ filterCounts }) => filterCounts));
    }
    return filterCountsPromise;
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
    ensureFilterCountsLoaded,
    ensureFilterManifestLoaded,
    ensureFilterTexturesLoaded,
    preloadFilterOverlayTextures,
    filterManifestFaces
  };
}
