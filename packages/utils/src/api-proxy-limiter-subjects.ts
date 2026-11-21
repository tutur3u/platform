/**
 * Rate-limit subjects for the API proxy guard. A request is checked against
 * every subject in order; the first exhausted window rejects it. A request
 * resolved to a shared Cloudflare address (Worker egress or the apex gateway
 * without a verified visitor proof) gets a narrower subject plus a bounded
 * aggregate on the shared address instead of one bucket for every visitor
 * behind it.
 */
import type { NextRequest, NextResponse } from 'next/server';
import { isCloudflareIp } from './abuse-protection/cloudflare-ip-ranges';
import type { RateLimitProfile } from './api-proxy-guard';
import {
  forgetRateLimiters,
  getRateLimiters,
  type RateLimitResult,
} from './api-proxy-rate-limiters';
import { buildProxyRateLimitRejection } from './proxy-rate-limit-rejection';

export type LimiterSubject = {
  id: string;
  prefix: string;
  rateLimits: RateLimitProfile;
};

/** Budget of all requests from one shared address, as a route-budget multiple. */
export const SHARED_EGRESS_AGGREGATE_MULTIPLIER = 20;
/** Budget of one site's anonymous CMS delivery reads, as a route-budget multiple. */
export const SHARED_EGRESS_SITE_MULTIPLIER = 10;

const CMS_DELIVERY_PATH =
  /^\/api\/v1\/workspaces\/([^/]{1,64})\/external-projects\/(?:delivery|assets)(?:\/|$)/u;
const APP_TOKEN = /^ttr_[A-Za-z0-9_-]+$/u;

function scaleProfile(
  profile: RateLimitProfile,
  multiplier: number
): RateLimitProfile {
  const scale = (configs: RateLimitProfile['get']) =>
    configs.map((config) => ({ ...config, limit: config.limit * multiplier }));
  return { get: scale(profile.get), mutate: scale(profile.mutate) };
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24);
}

/** The workspace app token (`ttr_…`) on the request, if any. */
function appToken(headers: Headers): string | null {
  const header = headers.get('authorization')?.trim() ?? '';
  const token = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : header;
  return APP_TOKEN.test(token) ? token : null;
}

/** The site an anonymous CMS delivery read belongs to, keyed by workspace. */
export function cmsDeliverySite(
  req: Pick<NextRequest, 'method' | 'nextUrl'>
): string | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const workspace = CMS_DELIVERY_PATH.exec(req.nextUrl.pathname)?.[1];
  return workspace ? workspace.toLowerCase() : null;
}

/**
 * Subjects for an anonymous request from a shared Cloudflare address, or null
 * for any other address. App-token calls are keyed per token, CMS delivery
 * reads per site, and other requests per address and client fingerprint;
 * every one also counts against the address aggregate, so rotating the
 * narrower key never exceeds a fixed multiple of the per-address budget.
 */
export async function sharedEgressSubjects(
  req: Pick<NextRequest, 'headers' | 'method' | 'nextUrl'>,
  ip: string,
  prefix: string,
  rateLimits: RateLimitProfile
): Promise<LimiterSubject[] | null> {
  if (!isCloudflareIp(ip)) return null;
  const aggregate: LimiterSubject = {
    id: `egress:${ip}`,
    prefix: `${prefix}:egress-x${SHARED_EGRESS_AGGREGATE_MULTIPLIER}`,
    rateLimits: scaleProfile(rateLimits, SHARED_EGRESS_AGGREGATE_MULTIPLIER),
  };
  const token = appToken(req.headers);
  if (token) {
    const id = `app:${await digest(`app-token:${token}`)}`;
    return [{ id, prefix: `${prefix}:app`, rateLimits }, aggregate];
  }
  const site = cmsDeliverySite(req);
  if (site) {
    return [
      {
        id: `site:${site}`,
        prefix: `${prefix}:site-x${SHARED_EGRESS_SITE_MULTIPLIER}`,
        rateLimits: scaleProfile(rateLimits, SHARED_EGRESS_SITE_MULTIPLIER),
      },
      aggregate,
    ];
  }
  const client = await digest(
    [
      req.headers.get('user-agent') ?? '',
      req.headers.get('accept-language') ?? '',
      req.headers.get('sec-ch-ua') ?? '',
    ].join('\n')
  );
  return [
    { id: `egress:${ip}:${client}`, prefix: `${prefix}:egress`, rateLimits },
    aggregate,
  ];
}

/** Checks each subject in order; returns the 429 for the first exhausted window. */
export async function enforceLimiterSubjects(
  req: NextRequest,
  subjects: LimiterSubject[],
  context: {
    callerClass: string;
    isDev: boolean;
    isRead: boolean;
    policyName: string;
  }
): Promise<NextResponse | null> {
  for (const { id, prefix, rateLimits } of subjects) {
    const cacheKey = `${prefix}:${JSON.stringify(rateLimits)}`;
    const limiters = await getRateLimiters(prefix, rateLimits);
    const active = limiters
      ? context.isRead
        ? limiters.get
        : limiters.mutate
      : [];

    for (const { limiter, window } of active) {
      let result: RateLimitResult | null | undefined;
      try {
        result = await limiter.limit(id);
      } catch {
        forgetRateLimiters(cacheKey);
        break;
      }
      if (!result) {
        forgetRateLimiters(cacheKey);
        break;
      }

      const { success, limit, remaining, reset } = result;
      if (context.isDev) {
        const kind = context.isRead ? 'read' : 'mutate';
        console.log(
          `[ProxyGuard] ${prefix}:${kind}:${window} ${limit - remaining}/${limit} | id: ${id} | path: ${req.nextUrl.pathname}`
        );
      }
      if (!success) {
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
        return buildProxyRateLimitRejection(
          req,
          retryAfter,
          {
            'X-Proxy-Block-Reason': 'route-rate-limit',
            'X-RateLimit-Limit': `${limit}`,
            'X-RateLimit-Remaining': `${remaining}`,
            'X-RateLimit-Reset': `${Math.ceil(reset / 1000)}`,
            'X-RateLimit-Caller-Class': context.callerClass,
            'X-RateLimit-Window': result.window ?? window,
            'X-RateLimit-Policy': context.policyName,
          },
          'proxy-rate-limited'
        );
      }
    }
  }
  return null;
}
