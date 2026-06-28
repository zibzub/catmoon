import { deflateSync, inflateSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COLS = 160;
const TILE_W = 21;
const TILE_H = 22;
const TRI_FACE_COUNT = 30;
const RHOMBUS_CAT_COUNT = 848;
const TRI_FACE_TEXTURE_PREFIX = "tri-face-";

const CHARACTER_CATEGORY_KEYS = [
  "garfield",
  "cheshire",
  "pinkpanther",
  "alien",
  "zombie",
  "simba",
  "golden",
  "pikachu"
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const atlasPath = path.join(__dirname, "img", "allcats.png");
const slotsPath = path.join(__dirname, "img", "tri-faces", "tri-face-slots.json");
const filtersPath = path.join(__dirname, "mooncat-filters.json");
const outputRoot = path.join(repoRoot, "public", "img", "filters");

function pad2(value) {
  return String(value).padStart(2, "0");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < table.length; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function readChunks(buffer) {
  const signature = buffer.subarray(0, 8);
  assert(signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "Input is not a PNG.");

  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += length + 12;
    if (type === "IEND") break;
  }
  return chunks;
}

function unfilterScanline(filter, scanline, previous, bytesPerPixel) {
  const out = Buffer.from(scanline);
  for (let i = 0; i < out.length; i += 1) {
    const left = i >= bytesPerPixel ? out[i - bytesPerPixel] : 0;
    const up = previous ? previous[i] : 0;
    const upLeft = previous && i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;

    if (filter === 1) {
      out[i] = (out[i] + left) & 0xff;
    } else if (filter === 2) {
      out[i] = (out[i] + up) & 0xff;
    } else if (filter === 3) {
      out[i] = (out[i] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      const p = left + up - upLeft;
      const pa = Math.abs(p - left);
      const pb = Math.abs(p - up);
      const pc = Math.abs(p - upLeft);
      const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      out[i] = (out[i] + predictor) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter type ${filter}.`);
    }
  }
  return out;
}

function decodePng(buffer) {
  const chunks = readChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR")?.data;
  assert(ihdr, "PNG is missing IHDR.");

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const compression = ihdr[10];
  const filter = ihdr[11];
  const interlace = ihdr[12];

  assert(bitDepth === 8, `Unsupported PNG bit depth ${bitDepth}; expected 8.`);
  assert(colorType === 6, `Unsupported PNG color type ${colorType}; expected RGBA.`);
  assert(compression === 0 && filter === 0 && interlace === 0, "Unsupported PNG compression/filter/interlace settings.");

  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const inflated = inflateSync(idat);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(width * height * bytesPerPixel);

  let inputOffset = 0;
  let previous = null;
  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[inputOffset];
    const scanline = inflated.subarray(inputOffset + 1, inputOffset + 1 + stride);
    const unfiltered = unfilterScanline(filterType, scanline, previous, bytesPerPixel);
    unfiltered.copy(pixels, y * stride);
    previous = unfiltered;
    inputOffset += stride + 1;
  }

  return { width, height, pixels };
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodeRgbaPng(image) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rawOffset = y * (stride + 1);
    raw[rawOffset] = 0;
    image.pixels.copy(raw, rawOffset + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND")
  ]);
}

function categoryIdSet(filters, key) {
  const category = filters.categories?.[key];
  assert(category && Array.isArray(category.ids), `Missing filters.categories.${key}.ids.`);
  return new Set(category.ids);
}

function unionCategoryIdSet(filters, keys) {
  const ids = new Set();
  for (const key of keys) {
    for (const id of categoryIdSet(filters, key)) {
      ids.add(id);
    }
  }
  return ids;
}

function drawCatNearest(atlas, output, id, destRect) {
  const srcX = (id % COLS) * TILE_W;
  const srcY = Math.floor(id / COLS) * TILE_H;
  const destX = Math.round(destRect.x);
  const destY = Math.round(destRect.y);
  const destW = Math.round(destRect.w);
  const destH = Math.round(destRect.h);

  for (let y = 0; y < destH; y += 1) {
    const sampleY = srcY + Math.min(TILE_H - 1, Math.floor((y * TILE_H) / destH));
    const outY = destY + y;
    if (outY < 0 || outY >= output.height) continue;

    for (let x = 0; x < destW; x += 1) {
      const sampleX = srcX + Math.min(TILE_W - 1, Math.floor((x * TILE_W) / destW));
      const outX = destX + x;
      if (outX < 0 || outX >= output.width) continue;

      const srcOffset = (sampleY * atlas.width + sampleX) * 4;
      const outOffset = (outY * output.width + outX) * 4;
      const srcA = atlas.pixels[srcOffset + 3];
      if (srcA === 0) continue;

      if (srcA === 255 || output.pixels[outOffset + 3] === 0) {
        output.pixels[outOffset] = atlas.pixels[srcOffset];
        output.pixels[outOffset + 1] = atlas.pixels[srcOffset + 1];
        output.pixels[outOffset + 2] = atlas.pixels[srcOffset + 2];
        output.pixels[outOffset + 3] = srcA;
        continue;
      }

      const dstA = output.pixels[outOffset + 3];
      const srcAlpha = srcA / 255;
      const dstAlpha = dstA / 255;
      const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
      output.pixels[outOffset] = Math.round(
        (atlas.pixels[srcOffset] * srcAlpha + output.pixels[outOffset] * dstAlpha * (1 - srcAlpha)) / outAlpha
      );
      output.pixels[outOffset + 1] = Math.round(
        (atlas.pixels[srcOffset + 1] * srcAlpha + output.pixels[outOffset + 1] * dstAlpha * (1 - srcAlpha)) / outAlpha
      );
      output.pixels[outOffset + 2] = Math.round(
        (atlas.pixels[srcOffset + 2] * srcAlpha + output.pixels[outOffset + 2] * dstAlpha * (1 - srcAlpha)) / outAlpha
      );
      output.pixels[outOffset + 3] = Math.round(outAlpha * 255);
    }
  }
}

function makeOverlayFace(atlas, metadata, faceIndex, idSet) {
  const output = {
    width: metadata.faceTextureWidth,
    height: metadata.faceTextureHeight,
    pixels: Buffer.alloc(metadata.faceTextureWidth * metadata.faceTextureHeight * 4)
  };
  const slots = metadata.faces[faceIndex];
  assert(Array.isArray(slots) && slots.length === RHOMBUS_CAT_COUNT, `Face ${faceIndex} has invalid slot metadata.`);

  for (const slot of slots) {
    const globalId = faceIndex * RHOMBUS_CAT_COUNT + slot.id;
    if (idSet.has(globalId)) {
      assert(slot.hitRect, `Face ${faceIndex} slot ${slot.id} is missing hitRect.`);
      drawCatNearest(atlas, output, globalId, slot.hitRect);
    }
  }

  return output;
}

async function writeOverlaySet({ name, ids, atlas, metadata }) {
  const outputDir = path.join(outputRoot, name);
  await mkdir(outputDir, { recursive: true });

  let drawn = 0;
  for (let faceIndex = 0; faceIndex < TRI_FACE_COUNT; faceIndex += 1) {
    const image = makeOverlayFace(atlas, metadata, faceIndex, ids);
    const filePath = path.join(outputDir, `${TRI_FACE_TEXTURE_PREFIX}${pad2(faceIndex)}.png`);
    await writeFile(filePath, encodeRgbaPng(image));
    drawn += metadata.faces[faceIndex].filter((slot) => ids.has(faceIndex * RHOMBUS_CAT_COUNT + slot.id)).length;
  }

  console.info(`Wrote ${TRI_FACE_COUNT} ${name} overlay PNGs to ${path.relative(repoRoot, outputDir)}/ (${drawn} matching cats).`);
}

async function main() {
  const [atlasBuffer, slotsBuffer, filtersBuffer] = await Promise.all([
    readFile(atlasPath),
    readFile(slotsPath, "utf8"),
    readFile(filtersPath, "utf8")
  ]);

  const atlas = decodePng(atlasBuffer);
  assert(atlas.width === COLS * TILE_W, `Atlas width ${atlas.width} did not match expected ${COLS * TILE_W}.`);
  assert(atlas.height % TILE_H === 0, `Atlas height ${atlas.height} is not divisible by tile height ${TILE_H}.`);

  const metadata = JSON.parse(slotsBuffer);
  assert(metadata.faceCount === TRI_FACE_COUNT, `Slot metadata faceCount ${metadata.faceCount} did not match ${TRI_FACE_COUNT}.`);
  assert(metadata.catCountPerFace === RHOMBUS_CAT_COUNT, `Slot metadata catCountPerFace ${metadata.catCountPerFace} did not match ${RHOMBUS_CAT_COUNT}.`);
  assert(Number.isInteger(metadata.faceTextureWidth) && Number.isInteger(metadata.faceTextureHeight), "Slot metadata is missing face texture dimensions.");

  const filters = JSON.parse(filtersBuffer);
  const genesisIds = categoryIdSet(filters, "genesis");
  const characterIds = unionCategoryIdSet(filters, CHARACTER_CATEGORY_KEYS);

  await writeOverlaySet({ name: "genesis", ids: genesisIds, atlas, metadata });
  await writeOverlaySet({ name: "characters", ids: characterIds, atlas, metadata });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
