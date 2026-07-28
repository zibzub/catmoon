export function calculateFittedFontSize({
  availableWidth,
  measuredWidth,
  maxFontSize,
  minFontSize
}) {
  if (!Number.isFinite(maxFontSize) || !Number.isFinite(minFontSize)) return minFontSize;
  if (!Number.isFinite(availableWidth) || !Number.isFinite(measuredWidth) || measuredWidth <= 0) {
    return maxFontSize;
  }
  if (measuredWidth <= availableWidth) return maxFontSize;

  return Math.max(
    minFontSize,
    Math.min(maxFontSize, maxFontSize * (availableWidth / measuredWidth))
  );
}

export function isSingleLineFit({ availableWidth, measuredWidth }) {
  return Number.isFinite(availableWidth)
    && Number.isFinite(measuredWidth)
    && availableWidth > 0
    && measuredWidth <= availableWidth;
}

const CLASSIFICATION_DISPLAY_NAMES = Object.freeze({
  pinkpanther: "pink panther",
});

export function formatClassificationFooterText(classifications) {
  const text =
    typeof classifications === "string" ? classifications.trim() : "";

  if (!text) return "";

  return text
    .split(/\s*,\s*/)
    .map((value) => CLASSIFICATION_DISPLAY_NAMES[value.toLowerCase()] ?? value)
    .join(" • ")
    .toUpperCase();
}

export function fitSingleLineText(element, {
  minFontSize = 12,
  step = 0.25
} = {}) {
  if (!element) return null;

  // Clear the previous fitted value so a wider card can restore its CSS size.
  element.style.removeProperty("font-size");
  const computedFontSize = Number.parseFloat(globalThis.getComputedStyle?.(element)?.fontSize ?? "");
  const maxFontSize = Number.isFinite(computedFontSize) ? computedFontSize : minFontSize;
  element.style.fontSize = `${maxFontSize}px`;

  const availableWidth = element.clientWidth;
  if (isSingleLineFit({ availableWidth, measuredWidth: element.scrollWidth })) return maxFontSize;

  let fittedFontSize = calculateFittedFontSize({
    availableWidth,
    measuredWidth: element.scrollWidth,
    maxFontSize,
    minFontSize
  });
  element.style.fontSize = `${fittedFontSize}px`;

  let attempts = 0;
  while (element.scrollWidth > element.clientWidth && fittedFontSize > minFontSize && attempts < 64) {
    fittedFontSize = Math.max(minFontSize, fittedFontSize - step);
    element.style.fontSize = `${fittedFontSize}px`;
    attempts += 1;
  }

  return fittedFontSize;
}
