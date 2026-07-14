export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function pad2(value) {
  return String(value).padStart(2, "0");
}
