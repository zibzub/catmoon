export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim();

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };

  if (!address) {
    return new Response(
      JSON.stringify({
        error: "Missing address",
        ids: [],
        count: 0,
      }),
      { status: 400, headers }
    );
  }

  // Real wallet lookup will go here later.
  // For now, return 501 so the frontend does not keep pretending every wallet has 4 cats.
  return new Response(
    JSON.stringify({
      error: "Wallet lookup not implemented yet",
      address,
      ids: [],
      count: 0,
    }),
    { status: 501, headers }
  );
}
