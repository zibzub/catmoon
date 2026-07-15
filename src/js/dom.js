export function loadBooleanSetting(storage, key, fallback = true) {
  try {
    const stored = (storage ?? globalThis.localStorage)?.getItem(key);
    if (stored === "on") return true;
    if (stored === "off") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function saveBooleanSetting(storage, key, enabled) {
  try {
    (storage ?? globalThis.localStorage)?.setItem(key, enabled ? "on" : "off");
  } catch {
    // Storage may be unavailable in private or restricted browsing contexts.
  }
  return Boolean(enabled);
}

export function getDomRefs() {
  return {
    smallStarsEl: document.getElementById("small-stars"),
    largeStarsEl: document.getElementById("large-stars"),
    canvas: document.getElementById("scene"),
    hud: document.getElementById("hud"),
    hudLockButton: document.getElementById("hudLockButton"),
    hudHelpButton: document.getElementById("hudHelpButton"),
    hudHelpPanel: document.getElementById("hudHelpPanel"),
    hoverPreviewToggleEl: document.getElementById("hoverPreviewToggle"),
    autoTumbleToggleEl: document.getElementById("autoTumbleToggle"),
    catLinksToggleEl: document.getElementById("catLinksToggle"),
    earlyRescueZoneToggleEl: document.getElementById("earlyRescueZoneToggle"),
    hybridStarfieldToggleEl: document.getElementById("hybridStarfieldToggle"),
    renderModeSelectEl: document.getElementById("renderModeSelect"),
    depthOfFieldControlsEl: document.getElementById("depthOfFieldControls"),
    depthOfFieldFocusInputEl: document.getElementById("depthOfFieldFocus"),
    depthOfFieldFocusValueEl: document.getElementById("depthOfFieldFocusValue"),
    depthOfFieldApertureInputEl: document.getElementById("depthOfFieldAperture"),
    depthOfFieldApertureValueEl: document.getElementById("depthOfFieldApertureValue"),
    depthOfFieldMaxBlurInputEl: document.getElementById("depthOfFieldMaxBlur"),
    depthOfFieldMaxBlurValueEl: document.getElementById("depthOfFieldMaxBlurValue"),
    depthOfFieldResetEl: document.getElementById("depthOfFieldReset"),
    catFilterEl: document.getElementById("catFilter"),
    walletFilterInputEl: document.getElementById("walletFilterInput"),
    walletFilterClearEl: document.getElementById("walletFilterClear"),
    walletFilterButtonEl: document.getElementById("walletFilterButton"),
    walletFilterStatusEl: document.getElementById("walletFilterStatus"),
    walletHistoryDropdownEl: document.getElementById("walletHistoryDropdown"),
    activeFilterBadgeEl: document.getElementById("activeFilterBadge"),
    activeFilterNameEl: document.getElementById("activeFilterName"),
    activeFilterStatEl: document.getElementById("activeFilterStat"),
    tooltipEl: document.getElementById("tooltip"),
    tooltipPreviewEl: document.getElementById("tooltipPreview"),
    tooltipLabelEl: document.getElementById("tooltipLabel"),
    pinnedTooltipEl: document.getElementById("pinnedTooltip"),
    pinnedTooltipPreviewEl: document.getElementById("pinnedTooltipPreview"),
    pinnedTooltipLabelEl: document.getElementById("pinnedTooltipLabel"),
    statusEl: document.getElementById("status"),
    loadingOverlay: document.getElementById("loadingOverlay"),
    loadingProgressEl: document.getElementById("loadingProgress")
  };
}
