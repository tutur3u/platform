/**
 * Headers for service-to-service calls from a Cloudflare Worker or Durable
 * Object into the platform API.
 *
 * Workers add no `User-Agent` to outbound `fetch` requests. The platform API
 * proxy treats an anonymous `/api/*` request without one as scanner traffic:
 * it answers 400 and can block the caller's egress IP. A checkpoint sent that
 * way never reaches its route, so the room keeps retrying and reporting the
 * backup as deferred.
 */
export const REALTIME_SERVICE_USER_AGENT =
  'Tuturuuu-Realtime/1.0 (+https://tuturuuu.com)';

export function serviceRequestHeaders(
  token: string,
  contentType = 'application/json'
): Record<string, string> {
  if (!token.trim()) throw new Error('Service request requires a token');
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'Content-Type': contentType,
    'User-Agent': REALTIME_SERVICE_USER_AGENT,
  };
}
