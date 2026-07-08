type LegacyHeadSourceResponse =
  | Response
  | undefined
  | Promise<Response | undefined>;

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
