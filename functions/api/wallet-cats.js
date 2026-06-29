import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const MAX_RESCUE_ORDER = 25439;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const ENS_PATTERN = /^[a-z0-9-_.]+\.eth$/i;
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
    const ids = await lookupAcclimatedMoonCatIds(wallet.address);
    return jsonResponse({
      input,
      address: wallet.address,
      resolvedName: wallet.resolvedName,
      ids,
      count: ids.length,
      source: "mooncatrescue"
    }, 200, "public, max-age=60");
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 502;
    return jsonResponse({
      error: error.message || "MoonCat Rescue API lookup failed.",
      input,
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
      resolvedName: null
    };
  }

  if (!ENS_PATTERN.test(input)) {
    throw new HttpError("Invalid Ethereum address or ENS name.", 400);
  }

  const name = input.toLowerCase();
  const rpcUrl = env?.ETH_RPC_URL;
  if (!rpcUrl) {
    throw new HttpError("ENS resolution is not configured. Missing ETH_RPC_URL.", 500);
  }

  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl)
  });
  const address = await client.getEnsAddress({ name });
  if (!address) {
    throw new HttpError("ENS name not found.", 404);
  }

  return {
    address,
    resolvedName: name
  };
}

async function lookupAcclimatedMoonCatIds(address) {
  const profilePayload = await fetchJson(`${OWNER_PROFILE_BASE_URL}/${encodeURIComponent(address)}`);
  const profileIds = extractAcclimatedRescueOrdersFromProfile(profilePayload);
  if (profileIds !== null) {
    return normalizeRescueOrders(profileIds);
  }

  for (const baseUrl of OWNED_MOONCATS_FALLBACK_URLS) {
    try {
      const fallbackPayload = await fetchJson(`${baseUrl}/${encodeURIComponent(address)}`);
      return normalizeRescueOrders(extractAcclimatedRescueOrdersFromOwnedMoonCats(fallbackPayload));
    } catch (error) {
      if (baseUrl === OWNED_MOONCATS_FALLBACK_URLS[OWNED_MOONCATS_FALLBACK_URLS.length - 1]) {
        throw error;
      }
    }
  }

  return [];
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

function extractAcclimatedRescueOrdersFromProfile(payload) {
  if (!payload || typeof payload !== "object") return null;

  const ownedMoonCats = firstArray(
    payload.ownedMoonCats,
    payload.moonCats,
    payload.cats,
    payload.tokens
  );
  if (!ownedMoonCats) return null;

  return extractAcclimatedRescueOrdersFromOwnedMoonCats(ownedMoonCats);
}

function extractAcclimatedRescueOrdersFromOwnedMoonCats(payload) {
  const cats = Array.isArray(payload) ? payload : firstArray(
    payload?.ownedMoonCats,
    payload?.moonCats,
    payload?.cats,
    payload?.tokens
  );
  if (!cats) return [];

  return cats
    .filter(isAcclimatedMoonCat)
    .map(rescueOrderFromMoonCat)
    .filter(Number.isInteger);
}

function firstArray(...values) {
  return values.find(Array.isArray) || null;
}

function isAcclimatedMoonCat(cat) {
  if (!cat || typeof cat !== "object") return false;

  const contractNames = [
    cat.contract?.name,
    cat.collection?.name,
    cat.location,
    cat.contract,
    cat.collection
  ].filter((value) => typeof value === "string");

  return contractNames.some((value) => value.toLowerCase().includes("acclimated"));
}

function rescueOrderFromMoonCat(cat) {
  for (const key of ["rescueOrder", "rescueIndex", "rescue_order", "rescue_order_id", "rescueOrderId"]) {
    const value = cat?.[key];
    if (Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

function normalizeRescueOrders(ids) {
  return Array.from(new Set(ids.filter((id) => (
    Number.isInteger(id)
    && id >= 0
    && id <= MAX_RESCUE_ORDER
  )))).sort((a, b) => a - b);
}

class HttpError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
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
