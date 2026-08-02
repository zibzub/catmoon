// LEGACY ONLY: derives names from the local mooncat_traits.json snapshot.
// Use `npm run sync:names` for the canonical mooncat-name-index mirror.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, "mooncat_traits.json");
const outputPath = path.join(repoRoot, "public", "data", "mooncat-names.json");
const MAX_RESCUE_ORDER = 25439;

function fail(message) {
  throw new Error(`Could not extract MoonCat names: ${message}`);
}

function normalizeName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRescueOrder(value) {
  if (Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

async function main() {
  let payload;
  try {
    payload = await readFile(sourcePath, "utf8");
  } catch (error) {
    fail(`${path.basename(sourcePath)} is missing from the repo root.`);
  }

  let traits;
  try {
    traits = JSON.parse(payload);
  } catch (error) {
    fail(`${path.basename(sourcePath)} is not valid JSON.`);
  }

  if (!Array.isArray(traits)) {
    fail(`${path.basename(sourcePath)} must be a JSON array.`);
  }

  const names = {};
  for (const entry of traits) {
    if (!entry || typeof entry !== "object") continue;

    const rescueOrder = normalizeRescueOrder(entry.rescueOrder);
    if (rescueOrder === null || rescueOrder < 0 || rescueOrder > MAX_RESCUE_ORDER) {
      fail(`invalid rescueOrder ${JSON.stringify(entry.rescueOrder)}.`);
    }

    const name = normalizeName(entry.name);
    if (name) {
      names[rescueOrder] = name;
    }
  }

  const sortedNames = {};
  for (const key of Object.keys(names).map(Number).sort((a, b) => a - b)) {
    sortedNames[key] = names[key];
  }

  await writeFile(outputPath, `${JSON.stringify(sortedNames, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(sortedNames).length} MoonCat names to ${path.relative(repoRoot, outputPath)}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
