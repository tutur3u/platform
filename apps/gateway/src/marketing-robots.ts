import policies from '../../../packages/utils/src/seo-policy.json';
import {
  PRIVATE_ROBOTS_HEADER,
  robotsForUrl,
} from '../../../packages/utils/src/seo-robots';

const ORIGIN_POLICY_HEADER = 'x-marketing-origin-robots';
const CANONICAL_ORIGIN = new URL(policies.marketing.origin).origin;

/** Where the gateway sent the request: Marketing, or an origin that owns its own robots. */
export type RobotsSource = 'marketing-page' | 'marketing' | 'origin';

function forcePrivate(headers: Headers) {
  const existing = headers.get('x-robots-tag') ?? '';
  if (!/\b(?:noindex|none)\b/iu.test(existing) || existing.includes(':')) {
    headers.set(
      'x-robots-tag',
      [PRIVATE_ROBOTS_HEADER, existing].filter(Boolean).join(', ')
    );
  }
}

/**
 * Only Marketing's own response provenance can release an origin restriction.
 * Other origins (Web on Vercel, mounted apps) own their robots policy on the
 * canonical URL: their published pages (changelog, download, models, cite)
 * stay indexable and their private routes keep their own noindex. Noncanonical
 * hosts and `TUTURUUU_NOINDEX=1` are private for every origin.
 *
 * `releaseUnmarked` covers Marketing Worker builds that predate the provenance
 * marker: they answer the exact private value for every host other than the
 * canonical one, which includes the gateway's origin fetch. When set, an
 * unmarked exact private value on an eligible canonical Marketing page is
 * released. Any other value, an ambiguous marker, a noncanonical host or
 * `TUTURUUU_NOINDEX=1` stays private.
 */
export function applyMarketingRobots(
  response: Response,
  request: Request,
  source: RobotsSource,
  noindex: boolean,
  releaseUnmarked = false
) {
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  const headers = result.headers;
  const marker = headers.get(ORIGIN_POLICY_HEADER);
  const originOnly = marker === '1';
  headers.delete(ORIGIN_POLICY_HEADER);
  const url = new URL(request.url);
  if (source === 'origin') {
    if (noindex || url.origin !== CANONICAL_ORIGIN) forcePrivate(headers);
    return result;
  }
  const robots = robotsForUrl(policies.marketing, url, { noindex });
  if (source !== 'marketing-page' || robots !== null) {
    forcePrivate(headers);
  } else if (
    headers.get('x-robots-tag') === PRIVATE_ROBOTS_HEADER &&
    (originOnly ||
      (releaseUnmarked && marker === null && url.origin === CANONICAL_ORIGIN))
  ) {
    headers.delete('x-robots-tag');
  }
  return result;
}
