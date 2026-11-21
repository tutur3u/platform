/**
 * Rate-limit subjects for the API proxy guard. A request is checked against
 * every subject in order; the first exhausted window rejects it. A request
 * resolved to a shared Cloudflare address (Worker egress or the apex gateway
 * without a verified visitor proof) is keyed per calling Worker zone when
 * Cloudflare names one, otherwise per client under a bounded aggregate for the
 * address, never in one bucket for every visitor behind it.
 */
import type { NextRequest, NextResponse } from 'next/server';
import { cloudflareWorkerZone } from './abuse-protection/abuse-subject';
import type { ClientIpConfig } from './abuse-protection/client-ip';
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

/** Budget of one shared address or one Worker zone, as a route-budget multiple. */
export const SHARED_EGRESS_AGGREGATE_MULTIPLIER = 20;
/** Budget of one site's anonymous CMS delivery reads, as a route-budget multiple. */
export const SHARED_EGRESS_SITE_MULTIPLIER = 10;

const CMS_DELIVERY_PATH =
  /^\/api\/v1\/workspaces\/([^/]{1,64})\/external-projects\/(?:delivery|assets)(?:\/|$)/u;

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
 * for any other address. A calling Worker zone is one caller with its own
 * aggregate; without one, requests are keyed per client under the address
 * aggregate, so rotating a header never exceeds a fixed multiple of the
 * per-address budget. CMS delivery reads are keyed per site and caller, so
 * draining a site from one address or zone never starves another. Credentials
 * are not keys here: an unverified token would mint fresh buckets.
 */
export async function sharedEgressSubjects(
  req: Pick<NextRequest, 'headers' | 'method' | 'nextUrl'>,
  ip: string,
  prefix: string,
  rateLimits: RateLimitProfile,
  config?: ClientIpConfig
): Promise<LimiterSubject[] | null> {
  if (!isCloudflareIp(ip)) return null;
  const zone = cloudflareWorkerZone(req.headers, ip, config);
  const caller = zone ? `worker:${zone}` : `egress:${ip}`;
  const aggregate: LimiterSubject = {
    id: caller,
    prefix: `${prefix}:${zone ? 'worker' : 'egress'}-x${SHARED_EGRESS_AGGREGATE_MULTIPLIER}`,
    rateLimits: scaleProfile(rateLimits, SHARED_EGRESS_AGGREGATE_MULTIPLIER),
  };
  const site = cmsDeliverySite(req);
  if (site) {
    return [
      {
        id: `site:${site}:${zone ? caller : `ip:${ip}`}`,
        prefix: `${prefix}:site-x${SHARED_EGRESS_SITE_MULTIPLIER}`,
        rateLimits: scaleProfile(rateLimits, SHARED_EGRESS_SITE_MULTIPLIER),
      },
      aggregate,
    ];
  }
  if (zone) return [aggregate];
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
