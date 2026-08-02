import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  MAX_RESCUE_ORDER,
  normalizeMooncatNames,
  parseMooncatNamesJson,
  serializeMooncatNames,
  syncMooncatNames
} from "../tools/sync-mooncat-names.js";

async function makeDestination(initialContent) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "catmoon-names-sync-"));
  const destinationPath = path.join(directory, "mooncat-names.json");
  if (initialContent !== undefined) await fs.writeFile(destinationPath, initialContent);
  return { directory, destinationPath };
}

async function removeTemporaryDirectory(directory) {
  await fs.rm(directory, { recursive: true, force: true });
}

function fakeFetch(sourceText, calls = []) {
  return async (url) => {
    calls.push(url);
    return {
      ok: true,
      async text() {
        return sourceText;
      }
    };
  };
}

test("normalizes valid names numerically while preserving exact strings and formatting", () => {
  const payload = { "10": "  Whiskers  ", "0": "", "2": "Name" };
  assert.deepEqual(normalizeMooncatNames(payload), {
    "0": "",
    "2": "Name",
    "10": "  Whiskers  "
  });
  assert.equal(serializeMooncatNames(payload), '{\n  "0": "",\n  "2": "Name",\n  "10": "  Whiskers  "\n}\n');
});

test("rejects malformed JSON and non-object payloads", () => {
  assert.throws(() => parseMooncatNamesJson("{"), /not valid JSON/);
  for (const source of ["null", "[]", '"names"', "42"]) {
    assert.throws(() => parseMooncatNamesJson(source), /plain non-array object/);
  }
});

test("rejects non-canonical rescue-order keys", () => {
  for (const key of ["-1", "+1", "01", "1.0", "1e1", " 1", "1 "]) {
    assert.throws(
      () => normalizeMooncatNames({ [key]: "Name" }),
      /invalid rescue-order key/
    );
  }
});

test("rejects out-of-range keys and non-string values", () => {
  for (const key of [String(MAX_RESCUE_ORDER + 1), "999999999999999999999"]) {
    assert.throws(() => normalizeMooncatNames({ [key]: "Name" }), /out of range/);
  }
  for (const value of [null, 1, false, [], {}]) {
    assert.throws(() => normalizeMooncatNames({ "7": value }), /must be a string/);
  }
});

test("syncs equivalent content without replacing the destination", async () => {
  const initial = '{\n  "0": "Zero",\n  "7": "Seven"\n}\n';
  const { directory, destinationPath } = await makeDestination(initial);
  const calls = [];
  try {
    const result = await syncMooncatNames({
      sourceUrl: "https://fixture.invalid/names.json",
      destinationPath,
      fetchImpl: fakeFetch('{"7":"Seven","0":"Zero"}', calls)
    });
    assert.deepEqual(result, { changed: false, destinationPath, count: 2 });
    assert.deepEqual(calls, ["https://fixture.invalid/names.json"]);
    assert.equal(await fs.readFile(destinationPath, "utf8"), initial);
    assert.deepEqual(await fs.readdir(directory), ["mooncat-names.json"]);
  } finally {
    await removeTemporaryDirectory(directory);
  }
});

test("atomically installs changed content and removes its temporary file", async () => {
  const { directory, destinationPath } = await makeDestination('{\n  "0": "Old"\n}\n');
  const calls = [];
  const recordingFs = {
    readFile: fs.readFile,
    writeFile: async (...args) => {
      calls.push(["writeFile", args[0]]);
      return fs.writeFile(...args);
    },
    rename: async (...args) => {
      calls.push(["rename", ...args]);
      return fs.rename(...args);
    },
    unlink: fs.unlink
  };
  try {
    const result = await syncMooncatNames({
      destinationPath,
      sourceText: '{"12":"New","0":"Zero"}',
      fsImpl: recordingFs
    });
    assert.equal(result.changed, true);
    assert.equal(await fs.readFile(destinationPath, "utf8"), '{\n  "0": "Zero",\n  "12": "New"\n}\n');
    assert.equal(calls[0][0], "writeFile");
    assert.match(calls[0][1], new RegExp(`^${directory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.mooncat-names\\.json\\.`));
    assert.deepEqual(calls[1], ["rename", calls[0][1], destinationPath]);
    assert.deepEqual(await fs.readdir(directory), ["mooncat-names.json"]);
  } finally {
    await removeTemporaryDirectory(directory);
  }
});

test("rejects invalid source before replacing an existing destination", async () => {
  const initial = '{\n  "0": "Safe"\n}\n';
  const { directory, destinationPath } = await makeDestination(initial);
  try {
    await assert.rejects(
      syncMooncatNames({ destinationPath, sourceText: '{"25440":"Invalid"}' }),
      /out of range/
    );
    assert.equal(await fs.readFile(destinationPath, "utf8"), initial);
  } finally {
    await removeTemporaryDirectory(directory);
  }
});
