import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MOONCAT_DETAIL_FIELDS,
  validateMoonCatDetail,
  validateMoonCatDetailShard
} from "../src/js/cat-details.js";
import { MAX_ID, RHOMBUS_CAT_COUNT, TRI_FACE_COUNT } from "../src/js/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, "mooncat_traits.json");
const outputDirectory = path.join(repoRoot, "public", "data", "mooncat-details");

function fail(message) {
  throw new Error(`Could not extract MoonCat details: ${message}`);
}

async function main() {
  let traits;
  try {
    traits = JSON.parse(await readFile(sourcePath, "utf8"));
  } catch (error) {
    fail(`${path.basename(sourcePath)} is missing or invalid JSON.`);
  }

  if (!Array.isArray(traits) || traits.length !== MAX_ID + 1) {
    fail(`${path.basename(sourcePath)} must contain exactly ${MAX_ID + 1} entries.`);
  }

  const detailsByRescueOrder = new Array(MAX_ID + 1);
  for (const trait of traits) {
    const rescueOrder = trait?.rescueOrder;
    if (!Number.isInteger(rescueOrder) || rescueOrder < 0 || rescueOrder > MAX_ID) {
      fail(`invalid rescueOrder ${JSON.stringify(rescueOrder)}.`);
    }
    if (detailsByRescueOrder[rescueOrder]) fail(`duplicate rescueOrder ${rescueOrder}.`);

    const detail = Object.fromEntries(MOONCAT_DETAIL_FIELDS.map((field) => [field, trait[field]]));
    if (!validateMoonCatDetail(detail, rescueOrder)) {
      fail(`invalid required detail fields for rescueOrder ${rescueOrder}.`);
    }
    detailsByRescueOrder[rescueOrder] = detail;
  }

  if (detailsByRescueOrder.some((detail) => !detail)) fail("source does not cover every rescue order.");

  const shards = Array.from({ length: TRI_FACE_COUNT }, (_, faceIndex) => (
    detailsByRescueOrder.slice(faceIndex * RHOMBUS_CAT_COUNT, (faceIndex + 1) * RHOMBUS_CAT_COUNT)
  ));
  if (shards.length !== TRI_FACE_COUNT || shards.some((shard, faceIndex) => !validateMoonCatDetailShard(shard, faceIndex))) {
    fail("generated shards are incomplete or invalid.");
  }

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(shards.map((shard, faceIndex) => (
    writeFile(
      path.join(outputDirectory, `face-${String(faceIndex).padStart(2, "0")}.json`),
      `${JSON.stringify(shard)}\n`
    )
  )));
  console.log(`Wrote ${shards.length} MoonCat detail shards (${TRI_FACE_COUNT} faces x ${RHOMBUS_CAT_COUNT} cats) to ${path.relative(repoRoot, outputDirectory)}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
