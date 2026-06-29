import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const MAX_RESCUE_ORDER = 25439;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ENS_PATTERN = /^[a-z0-9-_.]+\.[a-z0-9-_.]+$/i;
const OWNER_PROFILE_BASE_URL = "https://api.mooncatrescue.com/owner-profile";
const OWNED_MOONCATS_FALLBACK_URLS = [
  "https://api.mooncatrescue.com/owned-mooncats",
  "https://api.mooncat.community/owned-mooncats"
];

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const input = (url.searchParams.get("address") || "").trim();

  if (!input) {
    return jsonResponse({
      error: "Missing address query parameter.",
      ids: [],
      count: 0
    }, 400, "no-store");
  }

  try {
    const wallet = await resolveWalletInput(input, env);
    const result = await lookupMoonCatIds(wallet.address);
    return jsonResponse({
      input,
      address: wallet.address,
      resolvedName: wallet.resolvedName,
      ids: result.ids,
      count: result.ids.length,
      source: "mooncatrescue",
      ownershipTypes: result.ownershipTypes
    }, 200, "public, max-age=60");
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    return jsonResponse({
      error: error.message || "MoonCat Rescue API lookup failed.",
      input,
      resolvedName: error.resolvedName,
      ids: [],
      count: 0,
      source: "mooncatrescue"
    }, status, "no-store");
  }
}

async function resolveWalletInput(input, env) {
  if (ADDRESS_PATTERN.test(input)) {
    return {
      address: input,
      resolvedName: await resolveReverseEnsName(input, env)
    };
  }

  const name = normalizeEnsName(input);
  if (!name) {
    throw new HttpError("Invalid Ethereum address or ENS name.", 400);
  }

  const rpcUrl = env?.ETH_RPC_URL;
  if (!rpcUrl) {
    throw new HttpError("ENS resolution is not configured. Missing ETH_RPC_URL.", 500);
  }

  const client = makeEnsClient(rpcUrl);
  const address = await client.getEnsAddress({ name });
  if (!address) {
    throw new HttpError("ENS name not found.", 404, { resolvedName: name });
  }

  return {
    address,
    resolvedName: name
  };
}

function normalizeEnsName(input) {
  const name = input.toLowerCase().replace(/\.+$/, "");
  const normalizedName = name.endsWith(".eth") ? name : `${name}.eth`;
  if (!ENS_PATTERN.test(normalizedName)) return null;
  return normalizedName;
}

function makeEnsClient(rpcUrl) {
  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl)
  });
}

async function resolveReverseEnsName(address, env) {
  const rpcUrl = env?.ETH_RPC_URL;
  if (!rpcUrl) return null;

  try {
    const client = makeEnsClient(rpcUrl);
    const name = await client.getEnsName({ address });
    if (!name) return null;

    const normalizedName = name.toLowerCase();
    if (!ENS_PATTERN.test(normalizedName)) return null;

    const forwardAddress = await client.getEnsAddress({ name: normalizedName });
    if (forwardAddress?.toLowerCase() !== address.toLowerCase()) return null;

    return normalizedName;
  } catch (error) {
    return null;
  }
}

async function lookupMoonCatIds(address) {
  const profilePayload = await fetchJson(`${OWNER_PROFILE_BASE_URL}/${encodeURIComponent(address)}`);
  const profileResult = extractMoonCatOwnershipFromProfile(profilePayload);
  if (profileResult !== null) {
    return normalizeMoonCatOwnership(profileResult);
  }

  for (const baseUrl of OWNED_MOONCATS_FALLBACK_URLS) {
    try {
      const fallbackPayload = await fetchJson(`${baseUrl}/${encodeURIComponent(address)}`);
      return normalizeMoonCatOwnership(extractMoonCatOwnershipFromOwnedMoonCats(fallbackPayload));
    } catch (error) {
      if (baseUrl === OWNED_MOONCATS_FALLBACK_URLS[OWNED_MOONCATS_FALLBACK_URLS.length - 1]) {
        throw error;
      }
    }
  }

  return normalizeMoonCatOwnership([]);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`MoonCat Rescue API returned HTTP ${response.status}.`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error("MoonCat Rescue API returned invalid JSON.");
  }
}

function extractMoonCatOwnershipFromProfile(payload) {
  if (!payload || typeof payload !== "object") return null;

  const ownedMoonCats = firstArray(
    payload.ownedMoonCats,
    payload.moonCats,
    payload.cats,
    payload.tokens
  );
  if (!ownedMoonCats) return null;

  return extractMoonCatOwnershipFromOwnedMoonCats(ownedMoonCats);
}

function extractMoonCatOwnershipFromOwnedMoonCats(payload) {
  const cats = Array.isArray(payload) ? payload : firstArray(
    payload?.ownedMoonCats,
    payload?.moonCats,
    payload?.cats,
    payload?.tokens
  );
  if (!cats) return [];

  return cats
    .map((cat) => ({
      id: rescueOrderFromMoonCat(cat),
      type: ownershipTypeFromMoonCat(cat)
    }))
    .filter((entry) => Number.isInteger(entry.id));
}

function firstArray(...values) {
  return values.find(Array.isArray) || null;
}

function ownershipTypeFromMoonCat(cat) {
  if (!cat || typeof cat !== "object") return false;

  const labels = [
    cat.contract?.name,
    cat.collection?.name,
    cat.location,
    cat.location?.name,
    cat.contract?.location,
    cat.collection?.location,
    cat.contract,
    cat.collection
  ].filter((value) => typeof value === "string");

  const label = labels.join(" ").toLowerCase();
  if (label.includes("acclimated")) return "acclimated";
  if (label.includes("jumpport") || label.includes("jump port")) return "jumpport";
  if (label.includes("original") || label.includes("unwrapped")) return "original";
  return "unknown";
}

function rescueOrderFromMoonCat(cat) {
  for (const key of ["rescueOrder", "rescueIndex", "rescue_order", "rescue_order_id", "rescueOrderId"]) {
    const value = cat?.[key];
    if (Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

function normalizeMoonCatOwnership(entries) {
  const ids = [];
  const ownershipTypes = {};
  const seen = new Set();

  for (const entry of entries) {
    if (
      !Number.isInteger(entry.id)
      || entry.id < 0
      || entry.id > MAX_RESCUE_ORDER
      || seen.has(entry.id)
    ) {
      continue;
    }

    seen.add(entry.id);
    ids.push(entry.id);
    const type = entry.type || "unknown";
    ownershipTypes[type] = (ownershipTypes[type] || 0) + 1;
  }

  ids.sort((a, b) => a - b);
  return { ids, ownershipTypes };
}

class HttpError extends Error {
  constructor(message, status, details = {}) {
    super(message);
    this.status = status;
    Object.assign(this, details);
  }
}

function jsonResponse(body, status = 200, cacheControl = "public, max-age=60") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl
    }
  });
}
