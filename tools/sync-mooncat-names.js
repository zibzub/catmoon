import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export const DEFAULT_SOURCE_URL = "https://raw.githubusercontent.com/mooncatdao/mooncat-name-index/main/data/names-simple.json";
export const DEFAULT_OUTPUT_PATH = path.join(repoRoot, "public", "data", "mooncat-names.json");
export const MAX_RESCUE_ORDER = 25439;

const CANONICAL_RESCUE_ORDER = /^(?:0|[1-9]\d*)$/;

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeRescueOrderKey(key) {
  if (!CANONICAL_RESCUE_ORDER.test(key)) {
    throw new Error(`invalid rescue-order key ${JSON.stringify(key)}; expected canonical decimal keys`);
  }

  const rescueOrder = Number(key);
  if (!Number.isSafeInteger(rescueOrder) || rescueOrder > MAX_RESCUE_ORDER) {
    throw new Error(`rescue-order key ${JSON.stringify(key)} is out of range; expected 0-${MAX_RESCUE_ORDER}`);
  }

  return rescueOrder;
}

export function normalizeMooncatNames(payload) {
  if (!isPlainObject(payload)) {
    throw new Error("name payload must be a plain non-array object");
  }

  const entries = Object.keys(payload).map((key) => {
    const rescueOrder = normalizeRescueOrderKey(key);
    const value = payload[key];
    if (typeof value !== "string") {
      throw new Error(`name for rescue-order ${JSON.stringify(key)} must be a string`);
    }
    return { key, rescueOrder, value };
  });

  entries.sort((left, right) => left.rescueOrder - right.rescueOrder);
  const normalized = {};
  for (const { key, value } of entries) {
    normalized[key] = value;
  }
  return normalized;
}

export function parseMooncatNamesJson(sourceText) {
  let payload;
  try {
    payload = JSON.parse(sourceText);
  } catch (error) {
    throw new Error(`name source is not valid JSON: ${error.message}`);
  }
  return normalizeMooncatNames(payload);
}

export function serializeMooncatNames(payload) {
  return `${JSON.stringify(normalizeMooncatNames(payload), null, 2)}\n`;
}

async function downloadMooncatNames(sourceUrl, fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("a fetch implementation is required to download the name source");
  }

  let response;
  try {
    response = await fetchImpl(sourceUrl);
  } catch (error) {
    throw new Error(`could not download ${sourceUrl}: ${error.message}`);
  }

  if (!response || response.ok === false) {
    const status = response?.status ? ` (HTTP ${response.status})` : "";
    throw new Error(`could not download ${sourceUrl}${status}`);
  }

  if (typeof response.text !== "function") {
    throw new Error(`could not read downloaded name source from ${sourceUrl}`);
  }

  let sourceText;
  try {
    sourceText = await response.text();
  } catch (error) {
    throw new Error(`could not read downloaded name source from ${sourceUrl}: ${error.message}`);
  }
  return parseMooncatNamesJson(sourceText);
}

export async function writeAtomically(destinationPath, content, fsImpl = fs) {
  const directory = path.dirname(destinationPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(destinationPath)}.${process.pid}.${randomUUID()}.tmp`
  );

  try {
    await fsImpl.writeFile(temporaryPath, content, { flag: "wx" });
    await fsImpl.rename(temporaryPath, destinationPath);
  } finally {
    try {
      await fsImpl.unlink(temporaryPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

export async function syncMooncatNames({
  sourceUrl = DEFAULT_SOURCE_URL,
  destinationPath = DEFAULT_OUTPUT_PATH,
  fetchImpl = globalThis.fetch,
  sourceText,
  fsImpl = fs
} = {}) {
  const names = sourceText === undefined
    ? await downloadMooncatNames(sourceUrl, fetchImpl)
    : parseMooncatNamesJson(sourceText);
  const output = Buffer.from(`${JSON.stringify(names, null, 2)}\n`, "utf8");

  let current;
  try {
    current = await fsImpl.readFile(destinationPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (current && Buffer.compare(current, output) === 0) {
    return { changed: false, destinationPath, count: Object.keys(names).length };
  }

  await writeAtomically(destinationPath, output, fsImpl);
  return { changed: true, destinationPath, count: Object.keys(names).length };
}

async function main() {
  const sourceUrl = process.env.MOONCAT_NAMES_SOURCE_URL || DEFAULT_SOURCE_URL;
  const result = await syncMooncatNames({ sourceUrl });
  const relativePath = path.relative(repoRoot, result.destinationPath);
  const action = result.changed ? "Updated" : "Unchanged";
  console.log(`${action} ${relativePath} (${result.count} names).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Could not sync MoonCat names: ${error.message}`);
    process.exitCode = 1;
  });
}
