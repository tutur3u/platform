import policies from '../../../packages/utils/src/seo-policy.json';
import {
  PRIVATE_ROBOTS_HEADER,
  robotsForUrl,
} from '../../../packages/utils/src/seo-robots';

const ORIGIN_POLICY_HEADER = 'x-marketing-origin-robots';

/** Only Marketing's own response provenance can release an origin restriction. */
export function applyMarketingRobots(
  response: Response,
  request: Request,
  marketingPage: boolean,
  noindex: boolean
) {
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  const headers = result.headers;
  const originOnly = headers.get(ORIGIN_POLICY_HEADER) === '1';
  headers.delete(ORIGIN_POLICY_HEADER);
  const robots = robotsForUrl(policies.marketing, new URL(request.url), {
    noindex,
  });
  if (!marketingPage || robots !== null) {
    const existing = headers.get('x-robots-tag') ?? '';
    if (!/\b(?:noindex|none)\b/iu.test(existing) || existing.includes(':')) {
      headers.set(
        'x-robots-tag',
        [PRIVATE_ROBOTS_HEADER, existing].filter(Boolean).join(', ')
      );
    }
  } else if (
    originOnly &&
    headers.get('x-robots-tag') === PRIVATE_ROBOTS_HEADER
  ) {
    headers.delete('x-robots-tag');
  }
  return result;
}
