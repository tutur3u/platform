import type {
  ProxyRoutePolicy,
  RateLimitProfile,
} from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';

export const EMAIL_ROUTE_WORKSPACE_PATTERN =
  /^\/api\/v1\/workspaces\/([^/]+)\/(?:users\/[^/]+\/follow-up|user-groups\/[^/]+\/group-checks\/[^/]+\/email)(?:\/|$)/;

const EMAIL_RATE_LIMIT_OVERRIDE_ROUTE_POLICY: ProxyRoutePolicy = {
  key: 'email-rate-limit-override',
  matches: (req) => EMAIL_ROUTE_WORKSPACE_PATTERN.test(req.nextUrl.pathname),
  rateLimits: {
    get: [],
    mutate: [
      { window: 'minute', limit: 30, duration: '1 m' },
      { window: 'hour', limit: 120, duration: '1 h' },
      { window: 'day', limit: 600, duration: '1 d' },
    ],
  } satisfies RateLimitProfile,
};

/**
 * The Mastermind fleet publisher runs every 15 s from one machine without a
 * session. Each run pulls answers and alerts and, when due, PUTs its state and
 * usage snapshots, so the anonymous default buckets (1,200 reads and 600
 * mutations a day per IP) cannot hold it. Signed publisher calls get their own
 * bucket sized for that cadence plus bursts.
 *
 * The proxy cannot verify the HMAC without reading the body, so this policy
 * only selects the bucket for a well-formed signature on a publisher route and
 * method. Each route verifies the HMAC over `<unix seconds>.<method, path,
 * query and raw body>` and claims the nonce once, so a forged signature
 * reaches nothing beyond these routes and this bucket.
 */
const FLEET_PUBLISHER_ROUTES = new Map([
  ['GET', /^\/api\/v1\/mastermind\/fleet\/(?:answers|alerts)\/?$/u],
  ['POST', /^\/api\/v1\/mastermind\/fleet\/(?:answers|bridge\/ticket)\/?$/u],
  [
    'PUT',
    /^\/api\/v1\/mastermind\/fleet\/(?:state|usage|review-assets\/[^/]+)\/?$/u,
  ],
]);
/** Lowercase hex HMAC-SHA256, as the publisher signs it. */
const FLEET_SIGNATURE = /^[0-9a-f]{64}$/u;

export function isSignedFleetPublish(req: NextRequest) {
  return (
    FLEET_PUBLISHER_ROUTES.get(req.method)?.test(req.nextUrl.pathname) ===
      true &&
    FLEET_SIGNATURE.test(req.headers.get('x-mm-signature')?.trim() ?? '')
  );
}

export const FLEET_PUBLISHER_ROUTE_POLICY: ProxyRoutePolicy = {
  key: 'fleet-publisher',
  matches: isSignedFleetPublish,
  rateLimits: {
    // Two pulls a run: 8 a minute, 480 an hour, 11,520 a day at full cadence.
    get: [
      { window: 'minute', limit: 30, duration: '1 m' },
      { window: 'hour', limit: 1200, duration: '1 h' },
      { window: 'day', limit: 24_000, duration: '1 d' },
    ],
    mutate: [
      { window: 'minute', limit: 30, duration: '1 m' },
      { window: 'hour', limit: 1200, duration: '1 h' },
      { window: 'day', limit: 12_000, duration: '1 d' },
    ],
  },
};

/**
 * Route policies Web adds ahead of the shared defaults. The first matching
 * policy selects the bucket.
 */
export function webProxyRoutePolicies(
  hasEmailRateLimitOverrides: boolean
): ProxyRoutePolicy[] {
  return hasEmailRateLimitOverrides
    ? [FLEET_PUBLISHER_ROUTE_POLICY, EMAIL_RATE_LIMIT_OVERRIDE_ROUTE_POLICY]
    : [FLEET_PUBLISHER_ROUTE_POLICY];
}
