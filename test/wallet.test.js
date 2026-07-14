import test from "node:test";
import assert from "node:assert/strict";

import {
  abbreviateEthAddress,
  findWalletHistoryEntryByInput,
  getWalletUrlValue,
  normalizeWalletLookupRecord,
  normalizeWalletMatchValue,
  normalizeWalletMoonCatIds,
  walletDisplayLabel,
  walletHistoryDisplayLabel,
  walletHistoryLookupValue,
  walletHistoryMatchesQuery,
  walletLookupStorageKey
} from "../src/js/wallet.js";

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

test("normalizeWalletMoonCatIds filters, dedupes, and sorts valid MoonCat ids", () => {
  assert.deepEqual(
    normalizeWalletMoonCatIds([4, -1, 2, 4, 25439, 25440, 3.5, "7"]),
    [2, 4, 25439]
  );
  assert.throws(() => normalizeWalletMoonCatIds(null), /ids array/);
});

test("wallet labels prefer ENS names and abbreviate valid addresses", () => {
  assert.equal(abbreviateEthAddress(ADDRESS), "0x1234...5678");
  assert.equal(walletDisplayLabel({ resolvedName: "vitalik.eth", address: ADDRESS }, "fallback"), "vitalik.eth");
  assert.equal(walletDisplayLabel({ address: ADDRESS }, "fallback"), "0x1234...5678");
  assert.equal(walletDisplayLabel({}, "fallback"), "fallback");
});

test("wallet match and storage helpers normalize case and whitespace", () => {
  const record = {
    input: "Vitalik",
    resolvedName: "vitalik.eth",
    address: ADDRESS,
    label: "Vitalik ETH",
    ids: [1]
  };

  assert.equal(normalizeWalletMatchValue("  Vitalik.ETH  "), "vitalik.eth");
  assert.equal(walletLookupStorageKey(record), ADDRESS.toLowerCase());
  assert.equal(walletHistoryMatchesQuery(record, "TALIK"), true);
  assert.equal(walletHistoryMatchesQuery(record, "abcdef"), true);
  assert.equal(walletHistoryMatchesQuery(record, "not-a-match"), false);
  assert.equal(findWalletHistoryEntryByInput([record], " vitalik.eth "), record);
  assert.equal(findWalletHistoryEntryByInput([record], "vital"), null);
});

test("wallet URL and history display values never use abbreviated addresses as lookup values", () => {
  assert.equal(getWalletUrlValue({ resolvedName: "cats.eth", address: ADDRESS }), "cats.eth");
  assert.equal(getWalletUrlValue({ address: ADDRESS }), ADDRESS);
  assert.equal(walletHistoryLookupValue({ address: ADDRESS }), ADDRESS);
  assert.equal(walletHistoryDisplayLabel({ address: ADDRESS }), "0x1234...5678");
  assert.equal(walletHistoryDisplayLabel({ resolvedName: "cats.eth", address: ADDRESS }), "cats.eth");
});

test("normalizeWalletLookupRecord preserves compatible saved lookup records", () => {
  const record = normalizeWalletLookupRecord({
    input: "vitalik",
    resolvedName: "vitalik.eth",
    address: ADDRESS,
    ids: [9, 2, 2],
    lastUsed: 123
  });

  assert.deepEqual(record, {
    input: "vitalik",
    address: ADDRESS,
    resolvedName: "vitalik.eth",
    label: "vitalik.eth",
    ids: [2, 9],
    count: 2,
    lastUsed: 123
  });

  assert.equal(normalizeWalletLookupRecord({ ids: [] }), null);
  assert.equal(normalizeWalletLookupRecord({ ids: "bad" }), null);
});
