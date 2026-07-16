import { classifyGenesisDetail } from "./cat-details.js";

// This matches the validated desktop Template Frame card exactly. Keeping the
// export at the card's rendered size avoids a second, subtly different scale.
export const DETAIL_CARD_EXPORT_SIZE = Object.freeze({ width: 600, height: 840 });

export const DETAIL_CARD_EXPORT_LAYOUT = Object.freeze({
  coatRail: Object.freeze({ x: 0.052, y: 0.038, width: 0.896, height: 0.926 }),
  title: Object.freeze({ x: 0.081, y: 0.055, width: 0.838, height: 0.05 }),
  image: Object.freeze({ x: 0.085, y: 0.12, width: 0.83, height: 0.435 }),
  summary: Object.freeze({ x: 0.081, y: 0.561, width: 0.838, height: 0.051 }),
  details: Object.freeze({ x: 0.085, y: 0.626, width: 0.83, height: 0.272 }),
  detailsPadding: 12,
  preview: Object.freeze({ width: 252, height: 264 }),
  titleFontSize: 29,
  summaryFontSize: 25,
  traitFontSize: 23,
  traitLineHeight: 1.2,
  traitGap: 3,
  traitColumnGap: 7
});

export function detailCardExportFilename(rescueOrder) {
  return `mooncat-${Number.isInteger(rescueOrder) ? rescueOrder : "card"}-card.png`;
}

export function detailCardExportSummary(detail) {
  if (!detail) return "";
  return `${detail.rescueYear} RESCUE · ${detail.hueName} · ${detail.pattern}`.toUpperCase();
}

export function detailCardAtlasSourceRect(rescueOrder, { cols = 160, tileWidth = 21, tileHeight = 22 } = {}) {
  if (!Number.isInteger(rescueOrder) || rescueOrder < 0) return null;
  return {
    x: (rescueOrder % cols) * tileWidth,
    y: Math.floor(rescueOrder / cols) * tileHeight,
    width: tileWidth,
    height: tileHeight
  };
}

function loadImage(url, ImageCtor = globalThis.Image) {
  if (typeof ImageCtor !== "function") throw new Error("Image loading is unavailable.");
  return new Promise((resolve, reject) => {
    const image = new ImageCtor();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}.`));
    image.src = url;
  });
}

function drawCenteredText(context, text, x, y, width, height, font, color) {
  context.save();
  context.font = font;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  let rendered = text;
  while (rendered.length > 1 && context.measureText(rendered).width > width) {
    rendered = `${rendered.slice(0, -2)}…`;
  }
  context.fillText(rendered, x + (width / 2), y + (height / 2));
  context.restore();
}

function rectFromLayout({ x, y, width, height }, canvasSize) {
  return {
    x: x * canvasSize.width,
    y: y * canvasSize.height,
    width: width * canvasSize.width,
    height: height * canvasSize.height
  };
}

function fitTextToWidth(context, text, width) {
  let rendered = String(text);
  while (rendered.length > 1 && context.measureText(rendered).width > width) {
    rendered = `${rendered.slice(0, -2)}…`;
  }
  return rendered;
}

function drawTraitGrid(context, detail, detailsRect) {
  const layout = DETAIL_CARD_EXPORT_LAYOUT;
  const traits = [
    ["Cat ID", detail.catId],
    ["Hue", detail.hueInt],
    ["Coat", detail.pale ? "pale" : "normal"],
    ["Facing", detail.facing],
    ["Expression", detail.expression],
    ["Pose", detail.pose]
  ];
  const contentX = detailsRect.x + layout.detailsPadding;
  const contentWidth = detailsRect.width - (layout.detailsPadding * 2);
  const labelWidth = ((contentWidth - layout.traitColumnGap) * 0.4);
  const valueX = contentX + labelWidth + layout.traitColumnGap;
  const lineHeight = layout.traitFontSize * layout.traitLineHeight;
  const statusHeight = 13 * 1.35;
  const firstRowY = detailsRect.y + statusHeight + 9;

  context.save();
  context.beginPath();
  context.rect(detailsRect.x, detailsRect.y, detailsRect.width, detailsRect.height);
  context.clip();
  context.textBaseline = "top";
  traits.forEach(([label, value], row) => {
    const y = firstRowY + (row * (lineHeight + layout.traitGap));
    context.fillStyle = "#36545a";
    context.font = `${layout.traitFontSize}px "Pixel Operator", monospace`;
    context.fillText(fitTextToWidth(context, label, labelWidth), contentX, y);
    context.fillStyle = "#102126";
    context.font = `700 ${layout.traitFontSize}px "Pixel Operator Bold", monospace`;
    context.fillText(fitTextToWidth(context, value, contentWidth - labelWidth - layout.traitColumnGap), valueX, y);
  });
  context.restore();
}

function createGenesisFoilGradient(context, coatRail, genesis) {
  const gradient = context.createLinearGradient(
    coatRail.x,
    coatRail.y + coatRail.height,
    coatRail.x + coatRail.width,
    coatRail.y
  );

  const stops = genesis === "black"
    ? [
      [0, "#101218"],
      [0.28, "#252a35"],
      [0.44, "#11131a"],
      [0.49, "#737a8b"],
      [0.53, "#645675"],
      [0.58, "#222632"],
      [0.8, "#0b0d12"],
      [1, "#171921"]
    ]
    : [
      [0, "#ddd6ca"],
      [0.26, "#fffdf7"],
      [0.44, "#bfefff"],
      [0.5, "#ffd0e8"],
      [0.56, "#fff0a8"],
      [0.66, "#fffdf7"],
      [1, "#e8e1d6"]
    ];
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  return gradient;
}

export function renderDetailCardCanvas({ canvas, templateImage, atlasImage, detail, title, coatColor }) {
  const context = canvas?.getContext?.("2d");
  const source = detailCardAtlasSourceRect(detail?.rescueOrder);
  if (!context || !templateImage || !atlasImage || !detail || !source) {
    throw new Error("Card export data is incomplete.");
  }

  const { width, height } = DETAIL_CARD_EXPORT_SIZE;
  const size = DETAIL_CARD_EXPORT_SIZE;
  const layout = DETAIL_CARD_EXPORT_LAYOUT;
  const coatRail = rectFromLayout(layout.coatRail, size);
  const image = rectFromLayout(layout.image, size);
  const titleRect = rectFromLayout(layout.title, size);
  const summaryRect = rectFromLayout(layout.summary, size);
  const details = rectFromLayout(layout.details, size);
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;

  const genesis = classifyGenesisDetail(detail);
  context.fillStyle = genesis
    ? createGenesisFoilGradient(context, coatRail, genesis)
    : (coatColor || "#ff69b4");
  context.fillRect(coatRail.x, coatRail.y, coatRail.width, coatRail.height);
  context.fillStyle = "#000";
  context.fillRect(image.x, image.y, image.width, image.height);
  context.drawImage(
    atlasImage,
    source.x,
    source.y,
    source.width,
    source.height,
    image.x + ((image.width - layout.preview.width) / 2),
    image.y + ((image.height - layout.preview.height) / 2),
    layout.preview.width,
    layout.preview.height
  );
  context.fillStyle = "#ccecf2";
  context.fillRect(details.x, details.y, details.width, details.height);
  context.drawImage(templateImage, 0, 0, width, height);

  drawCenteredText(context, title, titleRect.x, titleRect.y, titleRect.width, titleRect.height, `700 ${layout.titleFontSize}px "Pixel Operator Bold", monospace`, "#0b0b09");
  drawCenteredText(context, detailCardExportSummary(detail), summaryRect.x, summaryRect.y, summaryRect.width, summaryRect.height, `700 ${layout.summaryFontSize}px "Pixel Operator Bold", monospace`, "#0b0b09");
  drawTraitGrid(context, detail, details);
  return canvas;
}

async function ensureExportFonts(documentRef) {
  if (!documentRef?.fonts?.load) return;
  await Promise.all([
    documentRef.fonts.load(`${DETAIL_CARD_EXPORT_LAYOUT.titleFontSize}px "Pixel Operator Bold"`),
    documentRef.fonts.load(`${DETAIL_CARD_EXPORT_LAYOUT.traitFontSize}px "Pixel Operator"`)
  ]);
}

export async function downloadDetailCardPng({
  detail,
  title,
  coatColor,
  documentRef = globalThis.document,
  urlRef = globalThis.URL,
  ImageCtor = globalThis.Image,
  templateUrl = "/img/template_full.png",
  atlasUrl = "/img/allcats.png"
}) {
  if (!documentRef?.createElement || !urlRef?.createObjectURL || !urlRef?.revokeObjectURL) {
    throw new Error("PNG export is unavailable.");
  }
  const [templateImage, atlasImage] = await Promise.all([
    loadImage(templateUrl, ImageCtor),
    loadImage(atlasUrl, ImageCtor),
    ensureExportFonts(documentRef)
  ]);
  const canvas = renderDetailCardCanvas({
    canvas: documentRef.createElement("canvas"),
    templateImage,
    atlasImage,
    detail,
    title,
    coatColor
  });
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not encode the card PNG.")), "image/png");
  });
  const objectUrl = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = objectUrl;
  anchor.download = detailCardExportFilename(detail.rescueOrder);
  anchor.hidden = true;
  documentRef.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => urlRef.revokeObjectURL(objectUrl), 0);
  return anchor.download;
}
