/**
 * Rate-limit budget for a verified meeting guest at the API proxy guard.
 *
 * A guest has no account, so without this every guest behind one address
 * shares the anonymous per-IP budget, and a classroom behind one school NAT
 * runs out within minutes. The app's proxy supplies a resolver that verifies
 * the server-signed guest session for the meeting in the request path; only
 * that verified pair (meeting id, guest id) keys a guest budget. Headers,
 * display names and unsigned or foreign-meeting cookies resolve to nothing and
 * stay on the anonymous budget.
 *
 * A guest request is checked against three subjects in order, and the first
 * exhausted one refuses it without charging the ones after it:
 * - the guest itself, with a budget sized for in-call polling, so a guest
 *   that floods never charges the shared buckets;
 * - the network, a fixed multiple of one guest, so many guest sessions from
 *   one address stay bounded while a classroom behind one NAT keeps working.
 *   An IPv6 client counts as its /64 (`networkSubject`), so rotating
 *   addresses inside it never opens a fresh cap;
 * - the meeting, a larger fixed multiple of one guest, so minting many guest
 *   sessions for one meeting never multiplies its traffic past that cap. A
 *   network over its own cap never charges it, so one network adds at most
 *   its own cap to a meeting and exhausting a meeting takes more than one
 *   network.
 */
import type { NextRequest, NextResponse } from 'next/server';
import type { RateLimitConfig, RateLimitProfile } from './api-proxy-guard';
import {
  enforceLimiterSubjects,
  type LimiterSubject,
} from './api-proxy-limiter-subjects';
import { networkSubject } from './network-subject';
import { parsePositiveIntEnv } from './positive-int-env';

/** A guest whose server-signed session the app verified for this request. */
export type VerifiedGuestActor = {
  /** The meeting (or other scope) the signed session is bound to. */
  scopeId: string;
  /** The participant id the server minted into the signed session. */
  guestId: string;
};

/**
 * Verifies the request's guest credential. It must check a server signature
 * bound to the scope in the request path and return null for anything else.
 */
export type GuestActorResolver = (
  req: NextRequest
) => Promise<VerifiedGuestActor | null>;

export const GUEST_CALLER_CLASS = 'guest';

/**
 * Guests' worth of traffic one network may carry: a class of about 50 guests
 * behind one school NAT at the call's worst-case polling, with at least 1.5x
 * headroom. It stays below the meeting's multiple, so one network alone never
 * exhausts a meeting.
 */
export const GUEST_ADDRESS_MULTIPLIER = 75;
/** Guests in one meeting whose combined traffic one meeting may carry. */
export const GUEST_SCOPE_MULTIPLIER = 100;

/**
 * One guest's budget. At the call's worst-case polling (a live poll, the
 * classroom pen board, the board list, a running transcript and Room Mira,
 * with a Mira settling burst and the lobby's polling before admission) and
 * half an hour of drawing on the classroom board (a write and a re-read per
 * stroke), a guest keeps at least 1.5x headroom on every minute and hour
 * budget. The hourly writes also cover a full hour of steady drawing with
 * 1.5x headroom, and the day's budgets cover about eight such hours.
 */
export function guestRateLimits(): RateLimitProfile {
  const config = (
    window: RateLimitConfig['window'],
    duration: RateLimitConfig['duration'],
    fallback: number,
    env: string
  ): RateLimitConfig => ({
    window,
    duration,
    limit: parsePositiveIntEnv(env, fallback),
  });
  return {
    get: [
      config('minute', '1 m', 150, 'API_PROXY_GUEST_READ_LIMIT_MINUTE'),
      config('hour', '1 h', 7000, 'API_PROXY_GUEST_READ_LIMIT_HOUR'),
      config('day', '1 d', 52_500, 'API_PROXY_GUEST_READ_LIMIT_DAY'),
    ],
    mutate: [
      config('minute', '1 m', 45, 'API_PROXY_GUEST_MUTATE_LIMIT_MINUTE'),
      config('hour', '1 h', 2000, 'API_PROXY_GUEST_MUTATE_LIMIT_HOUR'),
      config('day', '1 d', 16_000, 'API_PROXY_GUEST_MUTATE_LIMIT_DAY'),
    ],
  };
}

/** The aggregate keeps the minute and hour windows; the guest keeps the day. */
function aggregate(profile: RateLimitProfile, multiplier: number) {
  const scale = (configs: RateLimitConfig[]) =>
    configs
      .filter((config) => config.window !== 'day')
      .map((config) => ({ ...config, limit: config.limit * multiplier }));
  return { get: scale(profile.get), mutate: scale(profile.mutate) };
}

/** The subjects one verified guest request is charged against, in order. */
export function guestLimiterSubjects(
  prefixBase: string,
  routeKey: string,
  actor: VerifiedGuestActor,
  ipKey: string | null
): LimiterSubject[] {
  const prefix = `${prefixBase}:${routeKey}:${GUEST_CALLER_CLASS}`;
  const profile = guestRateLimits();
  return [
    {
      id: `guest:${actor.scopeId}:${actor.guestId}`,
      prefix,
      rateLimits: profile,
    },
    ...(ipKey
      ? [
          {
            id: `guest-net:${networkSubject(ipKey.replace(/^ip:/u, ''))}`,
            prefix: `${prefix}:address-x${GUEST_ADDRESS_MULTIPLIER}`,
            rateLimits: aggregate(profile, GUEST_ADDRESS_MULTIPLIER),
          },
        ]
      : []),
    {
      id: `guest-scope:${actor.scopeId}`,
      prefix: `${prefix}:scope-x${GUEST_SCOPE_MULTIPLIER}`,
      rateLimits: aggregate(profile, GUEST_SCOPE_MULTIPLIER),
    },
  ];
}

/**
 * The verified guest for a request, or null. A request that already has a
 * verified account actor keeps that actor's budget. Only the default route
 * policy takes a guest budget; stricter policies (sign-in, OTP, appeals) keep
 * their own limits. A resolver failure is treated as no guest.
 */
export async function resolveGuestActor(
  req: NextRequest,
  resolver: GuestActorResolver | undefined,
  context: { routeKey: string; hasActor: boolean }
): Promise<VerifiedGuestActor | null> {
  if (!resolver || context.hasActor || context.routeKey !== 'default')
    return null;
  try {
    const actor = await resolver(req);
    return actor?.scopeId && actor.guestId ? actor : null;
  } catch {
    return null;
  }
}

/**
 * Charges a verified guest request: guest, then network, then meeting. The
 * first exhausted window refuses it and nothing after it is charged.
 */
export function enforceGuestBudget(
  req: NextRequest,
  actor: VerifiedGuestActor,
  context: {
    prefixBase: string;
    routeKey: string;
    ipKey: string | null;
    isDev: boolean;
    isRead: boolean;
    policyName: string;
  }
): Promise<NextResponse | null> {
  return enforceLimiterSubjects(
    req,
    guestLimiterSubjects(
      context.prefixBase,
      context.routeKey,
      actor,
      context.ipKey
    ),
    {
      callerClass: GUEST_CALLER_CLASS,
      isDev: context.isDev,
      isRead: context.isRead,
      policyName: context.policyName,
    }
  );
}
