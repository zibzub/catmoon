export const DEFAULT_CAT_DETAILS_THEME = "rare-card";
export const CAT_DETAILS_THEMES = Object.freeze([
  DEFAULT_CAT_DETAILS_THEME,
  "classic-pepe",
  "template-card"
]);
export const CAT_DETAILS_THEME_STORAGE_KEY = "catmoon.detailsTheme.v1";

export function normalizeCatDetailsTheme(theme) {
  return CAT_DETAILS_THEMES.includes(theme) ? theme : DEFAULT_CAT_DETAILS_THEME;
}

export function loadCatDetailsTheme(storage) {
  try {
    const resolvedStorage = storage ?? globalThis.localStorage;
    return normalizeCatDetailsTheme(resolvedStorage?.getItem(CAT_DETAILS_THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_CAT_DETAILS_THEME;
  }
}

export function saveCatDetailsTheme(storage, theme) {
  const normalizedTheme = normalizeCatDetailsTheme(theme);
  try {
    const resolvedStorage = storage ?? globalThis.localStorage;
    resolvedStorage?.setItem(CAT_DETAILS_THEME_STORAGE_KEY, normalizedTheme);
  } catch {
    // Storage may be unavailable in private or restricted browsing contexts.
  }
  return normalizedTheme;
}

export function applyCatDetailsTheme(cardEl, theme) {
  const normalizedTheme = normalizeCatDetailsTheme(theme);
  if (cardEl?.dataset) cardEl.dataset.theme = normalizedTheme;
  return normalizedTheme;
}
