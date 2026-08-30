import test from "node:test";
import assert from "node:assert/strict";

import {
  onRequestGet,
  onRequestOptions
} from "../functions/api/wallet-cats.js";

const CATLAB_ORIGIN = "https://catlab.pages.dev";
const CATMOON_ORIGIN = "https://catmoon.zibzub.art";
const UNAPPROVED_ORIGIN = "https://example.com";
const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

function makeRequest(url, { origin, method = "GET" } = {}) {
  const headers = origin ? { Origin: origin } : undefined;
  return new Request(url, { method, headers });
}

function makeJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function withMockedFetch(callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), new RegExp(`^https://api\\.mooncatrescue\\.com/owner-profile/`));
    return makeJsonResponse({
      ownedMoonCats: [
        { rescueOrder: 12, location: "Original" },
        { rescueIndex: "845", contract: { name: "JumpPort" } }
      ]
    });
  };

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("allowed CatLab origin receives exact CORS headers on success", async () => {
  await withMockedFetch(async () => {
    const response = await onRequestGet({
      request: makeRequest(`https://catmoon.zibzub.art/api/wallet-cats?address=${ADDRESS}`, {
        origin: CATLAB_ORIGIN
      }),
      env: {}
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), CATLAB_ORIGIN);
    assert.equal(response.headers.get("vary"), "Origin");
  });
});

test("allowed CatMoon origin receives exact CORS headers on success", async () => {
  await withMockedFetch(async () => {
    const response = await onRequestGet({
      request: makeRequest(`https://catmoon.zibzub.art/api/wallet-cats?address=${ADDRESS}`, {
        origin: CATMOON_ORIGIN
      }),
      env: {}
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), CATMOON_ORIGIN);
    assert.equal(response.headers.get("vary"), "Origin");
  });
});

test("cached responses reapply the requesting allowed origin", async () => {
  const originalCaches = globalThis.caches;
  const responses = new Map();
  globalThis.caches = {
    default: {
      match: async (request) => responses.get(request.url)?.clone(),
      put: async (request, response) => responses.set(request.url, response)
    }
  };

  try {
    await withMockedFetch(async () => {
      const firstResponse = await onRequestGet({
        request: makeRequest(`https://catmoon.zibzub.art/api/wallet-cats?address=${ADDRESS}`, {
          origin: CATLAB_ORIGIN
        }),
        env: {}
      });
      assert.equal(firstResponse.headers.get("access-control-allow-origin"), CATLAB_ORIGIN);

      const cachedResponse = await onRequestGet({
        request: makeRequest(`https://catmoon.zibzub.art/api/wallet-cats?address=${ADDRESS}`, {
          origin: CATMOON_ORIGIN
        }),
        env: {}
      });

      assert.equal(cachedResponse.headers.get("access-control-allow-origin"), CATMOON_ORIGIN);
      assert.equal(cachedResponse.headers.get("vary"), "Origin");
    });
  } finally {
    if (originalCaches === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = originalCaches;
    }
  }
});

test("unapproved origins do not receive Access-Control-Allow-Origin", async () => {
  const response = await onRequestGet({
    request: makeRequest("https://catmoon.zibzub.art/api/wallet-cats", {
      origin: UNAPPROVED_ORIGIN
    }),
    env: {}
  });

  assert.equal(response.status, 400);
  assert.equal(response.headers.has("access-control-allow-origin"), false);
});

test("requests without Origin continue to return the existing success contract", async () => {
  await withMockedFetch(async () => {
    const response = await onRequestGet({
      request: makeRequest(`https://catmoon.zibzub.art/api/wallet-cats?address=${ADDRESS}`),
      env: {}
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.has("access-control-allow-origin"), false);
    assert.equal(response.headers.get("cache-control"), "public, max-age=300");
    assert.deepEqual(payload, {
      input: ADDRESS,
      address: ADDRESS,
      resolvedName: null,
      ids: [12, 845],
      count: 2,
      source: "mooncatrescue",
      ownershipTypes: { original: 1, jumpport: 1 }
    });
  });
});

test("approved origins receive CORS headers on validation errors", async () => {
  const response = await onRequestGet({
    request: makeRequest("https://catmoon.zibzub.art/api/wallet-cats", {
      origin: CATLAB_ORIGIN
    }),
    env: {}
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("access-control-allow-origin"), CATLAB_ORIGIN);
  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(payload, {
    error: "Missing address query parameter.",
    ids: [],
    count: 0
  });
});

test("OPTIONS exposes only the endpoint methods and allowed origin", async () => {
  const response = onRequestOptions({
    request: makeRequest("https://catmoon.zibzub.art/api/wallet-cats", {
      method: "OPTIONS",
      origin: CATLAB_ORIGIN
    })
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), CATLAB_ORIGIN);
  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  assert.equal(response.headers.get("access-control-allow-headers"), "Accept");
});
