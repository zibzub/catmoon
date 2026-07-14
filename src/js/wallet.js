import {
  MAX_ID,
  WALLET_LOOKUP_HISTORY_KEY,
  WALLET_LOOKUP_HISTORY_LIMIT
} from "./config.js";

export function normalizeWalletMoonCatIds(ids) {
  if (!Array.isArray(ids)) {
    throw new Error("Wallet lookup response did not include an ids array.");
  }

  return Array.from(new Set(ids.filter((id) => (
    Number.isInteger(id)
    && id >= 0
    && id <= MAX_ID
  )))).sort((a, b) => a - b);
}

export function abbreviateEthAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function walletDisplayLabel(payload, fallback) {
  if (payload?.resolvedName) {
    return payload.resolvedName;
  }
  if (typeof payload?.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(payload.address)) {
    return abbreviateEthAddress(payload.address);
  }
  return fallback;
}

export async function lookupWalletMoonCats(input) {
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

export function walletLookupStorageKey(record) {
  return (record.address || record.resolvedName || record.input || record.label || "").toLowerCase();
}

export function normalizeWalletMatchValue(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getWalletUrlValue(lookupResult) {
  const resolvedName = typeof lookupResult?.resolvedName === "string" ? lookupResult.resolvedName.trim() : "";
  if (resolvedName) return resolvedName;

  const address = typeof lookupResult?.address === "string" ? lookupResult.address.trim() : "";
  return address;
}

export function setWalletUrl(value) {
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

export function clearWalletUrl() {
  if (!window.history?.replaceState) return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has("wallet")) return;
  url.searchParams.delete("wallet");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function getWalletParamFromUrl() {
  const value = new URLSearchParams(window.location.search).get("wallet");
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeWalletLookupRecord(record) {
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

export function loadWalletLookupHistory() {
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

export function saveWalletLookupHistory(history) {
  try {
    window.localStorage.setItem(WALLET_LOOKUP_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn("Could not save CatMoon wallet lookup history.", error);
  }
}

export function walletHistoryLookupValue(record) {
  return getWalletUrlValue(record) || record.input || record.label || "";
}

export function walletHistoryDisplayLabel(record) {
  if (record?.resolvedName) return record.resolvedName;
  if (typeof record?.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(record.address)) {
    return abbreviateEthAddress(record.address);
  }
  return record?.label || record?.input || walletHistoryLookupValue(record);
}

export function walletHistoryMatchesQuery(record, query) {
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

export function findWalletHistoryEntryByInput(history, value) {
  const matchValue = normalizeWalletMatchValue(value);
  if (!matchValue) return null;

  return history.find((record) => (
    [
      record.input,
      record.resolvedName,
      record.address,
      record.label
    ].some((candidate) => normalizeWalletMatchValue(candidate) === matchValue)
  )) || null;
}
