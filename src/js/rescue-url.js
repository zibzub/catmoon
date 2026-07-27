import { parseRescueId } from "./catmoon-geometry.js";

const RESCUE_URL_BASE = "https://catmoon.invalid/";

export function normalizeRescueView(value) {
  return value === "details" ? "details" : "pin";
}

export function parseRescueUrlState(input) {
  const url = input instanceof URL
    ? input
    : new URL(input || RESCUE_URL_BASE, RESCUE_URL_BASE);
  const rescueId = parseRescueId(url.searchParams.get("rescue"));
  if (rescueId === null) return null;

  return {
    rescueId,
    view: normalizeRescueView(url.searchParams.get("view"))
  };
}

export function updateRescueUrl(input, { rescueId = null, view = "pin" } = {}) {
  const url = input instanceof URL
    ? new URL(input.href)
    : new URL(input || RESCUE_URL_BASE, RESCUE_URL_BASE);

  if (rescueId === null) {
    url.searchParams.delete("rescue");
    url.searchParams.delete("view");
    return url;
  }

  url.searchParams.set("rescue", String(rescueId));
  if (normalizeRescueView(view) === "details") {
    url.searchParams.set("view", "details");
  } else {
    url.searchParams.delete("view");
  }
  return url;
}
