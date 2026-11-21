type UpgradeResponse = Response & { webSocket?: unknown };

/**
 * A copy of `response` with `headers`, preserving a WebSocket upgrade (101):
 * Workers re-create it only with its `webSocket`. An upgrade that cannot be
 * re-created is refused rather than passed through with its headers.
 */
export function withHeaders(response: Response, headers: Headers): Response {
  if (response.status !== 101)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  try {
    return new Response(null, {
      status: 101,
      headers,
      webSocket: (response as UpgradeResponse).webSocket,
    } as ResponseInit);
  } catch {
    return new Response('Refused upgrade', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
