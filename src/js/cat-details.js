import { MAX_ID, RHOMBUS_CAT_COUNT, TRI_FACE_COUNT } from "./config.js";

export const MOONCAT_DETAIL_FIELDS = Object.freeze([
  "rescueOrder",
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

export const OPENSEA_ACCLIMATED_CONTRACT = "0xc3f733ca98e0dad0386979eb96fb1722a1a05e69";

function isValidRescueOrder(rescueOrder) {
  return Number.isInteger(rescueOrder) && rescueOrder >= 0 && rescueOrder <= MAX_ID;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

export function moonCatDetailLocation(rescueOrder) {
  if (!isValidRescueOrder(rescueOrder)) return null;

  const faceIndex = Math.floor(rescueOrder / RHOMBUS_CAT_COUNT);
  return {
    rescueOrder,
    faceIndex,
    slotId: rescueOrder % RHOMBUS_CAT_COUNT,
    shardPath: `/data/mooncat-details/face-${String(faceIndex).padStart(2, "0")}.json`
  };
}

export function moonCatDetailLinks(rescueOrder) {
  if (!isValidRescueOrder(rescueOrder)) return null;

  return {
    chainStation: `https://mooncatrescue.com/mooncats/${rescueOrder}`,
    openSea: `https://opensea.io/item/ethereum/${OPENSEA_ACCLIMATED_CONTRACT}/${rescueOrder}`
  };
}

export function validateMoonCatDetail(detail, expectedRescueOrder) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  if (!isValidRescueOrder(detail.rescueOrder) || detail.rescueOrder !== expectedRescueOrder) return null;
  if (!Number.isInteger(detail.rescueYear) || !Number.isInteger(detail.hueInt)) return null;
  if (typeof detail.pale !== "boolean") return null;

  for (const field of ["catId", "hueName", "facing", "expression", "pattern", "pose"]) {
    if (!isNonEmptyString(detail[field])) return null;
  }

  return Object.fromEntries(MOONCAT_DETAIL_FIELDS.map((field) => [field, detail[field]]));
}

export function validateMoonCatDetailShard(shard, faceIndex) {
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex >= TRI_FACE_COUNT) return null;
  if (!Array.isArray(shard) || shard.length !== RHOMBUS_CAT_COUNT) return null;

  const firstRescueOrder = faceIndex * RHOMBUS_CAT_COUNT;
  const validated = shard.map((detail, slotId) => validateMoonCatDetail(detail, firstRescueOrder + slotId));
  return validated.every(Boolean) ? validated : null;
}

export function createMoonCatDetailsLoader(fetchImpl = globalThis.fetch) {
  const faceCache = new Map();

  async function loadFace(faceIndex) {
    if (faceCache.has(faceIndex)) return faceCache.get(faceIndex);

    const location = moonCatDetailLocation(faceIndex * RHOMBUS_CAT_COUNT);
    if (!location || typeof fetchImpl !== "function") {
      throw new Error("MoonCat detail data is unavailable.");
    }

    const request = Promise.resolve(fetchImpl(location.shardPath))
      .then(async (response) => {
        if (!response?.ok) throw new Error("Could not load MoonCat details.");
        return validateMoonCatDetailShard(await response.json(), faceIndex);
      })
      .then((shard) => {
        if (!shard) throw new Error("MoonCat detail data is invalid.");
        return shard;
      });

    faceCache.set(faceIndex, request);
    try {
      return await request;
    } catch (error) {
      faceCache.delete(faceIndex);
      throw error;
    }
  }

  async function load(rescueOrder) {
    const location = moonCatDetailLocation(rescueOrder);
    if (!location) throw new Error("MoonCat rescue order is invalid.");
    return (await loadFace(location.faceIndex))[location.slotId];
  }

  return { load, loadFace };
}
