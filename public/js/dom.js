export function getDomRefs() {
  return {
    smallStarsEl: document.getElementById("small-stars"),
    largeStarsEl: document.getElementById("large-stars"),
    canvas: document.getElementById("scene"),
    hud: document.getElementById("hud"),
    hudLockButton: document.getElementById("hudLockButton"),
    hoverPreviewToggleEl: document.getElementById("hoverPreviewToggle"),
    catFilterEl: document.getElementById("catFilter"),
    walletFilterInputEl: document.getElementById("walletFilterInput"),
    walletFilterClearEl: document.getElementById("walletFilterClear"),
    walletFilterButtonEl: document.getElementById("walletFilterButton"),
    walletFilterStatusEl: document.getElementById("walletFilterStatus"),
    walletHistoryDropdownEl: document.getElementById("walletHistoryDropdown"),
    activeFilterBadgeEl: document.getElementById("activeFilterBadge"),
    activeFilterNameEl: document.getElementById("activeFilterName"),
    tooltipEl: document.getElementById("tooltip"),
    tooltipPreviewEl: document.getElementById("tooltipPreview"),
    tooltipLabelEl: document.getElementById("tooltipLabel"),
    statusEl: document.getElementById("status"),
    loadingOverlay: document.getElementById("loadingOverlay"),
    loadingProgressEl: document.getElementById("loadingProgress")
  };
}
