type LegacyHeadSourceResponse =
  | Response
  | undefined
  | Promise<Response | undefined>;

/**
 * Mirrors apps/web's `createLegacyHeadHandler`: derives a headers-only HEAD
 * handler from an existing GET handler so satellite API routes stay faithful to
 * the web route behavior they replaced.
 */
export function createLegacyHeadHandler<Args extends unknown[]>(
  get: (...args: Args) => LegacyHeadSourceResponse
) {
  return async function HEAD(...args: Args) {
    const response = await get(...args);
    if (!response) return response;

    return new Response(null, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  };
}
