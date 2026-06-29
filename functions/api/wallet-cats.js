export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const address = (url.searchParams.get("address") || "").trim();

  if (!address) {
    return jsonResponse({
      error: "Missing address query parameter.",
      ids: [],
      count: 0
    }, 400);
  }

  // TODO: Resolve ownership from the official acclimated MoonCats wrapper first.
  // TODO: Add original/unwrapped MoonCats ownership after the wrapper source is live.
  return jsonResponse({
    address,
    error: "Wallet MoonCat lookup is not implemented yet.",
    ids: [],
    count: 0
  }, 501);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
