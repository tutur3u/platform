import type {
  GuardWindowOutcome,
  GuardWindowSubject,
} from '@tuturuuu/utils/abuse-guard/client';
import { createLocalWindowLimiter } from '@tuturuuu/utils/abuse-guard/local-cache';
import { networkSubject } from '@tuturuuu/utils/network-subject';
import { parsePositiveIntEnv } from '@tuturuuu/utils/positive-int-env';

/**
 * Guest join attempts per network for one meeting link per window: an IPv4
 * address, or an IPv6 /64 (`networkSubject`). It is sized for one class of
 * about 50 guests behind one school NAT joining in a burst, with retries,
 * reconnects after a phone locks and failed Turnstile checks all counting.
 * Turnstile, the name checks and host admission stay the gate for real
 * access; this only bounds how fast one network can mint sessions.
 */
export const MEET_GUEST_JOIN_LIMIT = 200;
export const MEET_GUEST_JOIN_WINDOW_MS = 10 * 60_000;
/**
 * Guest join attempts per network across every meeting per window, so one
 * address cannot mint guests over many meetings; it covers that class plus a
 * second room on the same network.
 */
export const MEET_GUEST_JOIN_NETWORK_LIMIT = 400;
export const MEET_GUEST_JOIN_NETWORK_WINDOW_MS = 60 * 60_000;
/**
 * Overrides for the two limits, parsed like the proxy's limits: anything but
 * a plain positive integer keeps the default.
 */
export const MEET_GUEST_JOIN_LIMIT_ENV = 'MEET_GUEST_JOIN_LIMIT';
export const MEET_GUEST_JOIN_NETWORK_LIMIT_ENV =
  'MEET_GUEST_JOIN_NETWORK_HOURLY_LIMIT';

/** The effective per-meeting and cross-meeting join limits. */
export function meetGuestJoinLimits() {
  return {
    meeting: parsePositiveIntEnv(
      MEET_GUEST_JOIN_LIMIT_ENV,
      MEET_GUEST_JOIN_LIMIT
    ),
    network: parsePositiveIntEnv(
      MEET_GUEST_JOIN_NETWORK_LIMIT_ENV,
      MEET_GUEST_JOIN_NETWORK_LIMIT
    ),
  };
}

export type MeetGuestJoinLimitDecision =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export type MeetGuestJoinLimiter = {
  hitWindows: (subjects: GuardWindowSubject[]) => Promise<GuardWindowOutcome>;
};

export function meetGuestJoinWindows(
  meetingId: string,
  network: string,
  eventLimit?: number,
  phase?: 'challenge' | 'work' | 'verify'
): GuardWindowSubject[] {
  const limits = meetGuestJoinLimits();
  return [
    {
      partition: `meet-guest-ip:${network}`,
      windows: eventLimit
        ? [
            {
              key: `event-${phase ?? 'join'}:${meetingId}:10m`,
              limit: eventLimit,
              windowMs: MEET_GUEST_JOIN_WINDOW_MS,
              algo: 'fixed',
            },
          ]
        : [
            {
              key: `join:${meetingId}:10m`,
              limit: limits.meeting,
              windowMs: MEET_GUEST_JOIN_WINDOW_MS,
              algo: 'fixed',
            },
            {
              key: 'join:all-meetings:1h',
              limit: limits.network,
              windowMs: MEET_GUEST_JOIN_NETWORK_WINDOW_MS,
              algo: 'fixed',
            },
          ],
    },
  ];
}

/** Most network and meeting counters one isolate keeps while counting locally. */
const LOCAL_ATTEMPT_ENTRIES = 10_000;
let localAttempts = createLocalWindowLimiter(LOCAL_ATTEMPT_ENTRIES);

/** Test hook: forget the per-isolate attempt counts. */
export function resetMeetGuestJoinLimiter() {
  localAttempts = createLocalWindowLimiter(LOCAL_ATTEMPT_ENTRIES);
}

function retryAfter(resetAt: number, now: number) {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

/**
 * Charges one guest join attempt. The shared Durable Object store decides
 * when it is reachable. Turnstile stays the hard gate, so when the store is
 * unbound or failing the attempt is still counted per isolate instead of
 * being let through uncounted.
 */
export async function checkMeetGuestJoinLimit(
  input: {
    meetingId: string;
    network: string | undefined;
    eventLimit?: number;
    phase?: 'challenge' | 'work' | 'verify';
    requireSharedStore?: true;
  },
  limiter: MeetGuestJoinLimiter | null,
  now: () => number = Date.now
): Promise<MeetGuestJoinLimitDecision> {
  // An IPv6 client counts as its /64, so rotating addresses opens no window.
  const network = networkSubject(input.network?.trim() || 'unknown');
  if (limiter) {
    try {
      const outcome = await limiter.hitWindows(
        meetGuestJoinWindows(
          input.meetingId,
          network,
          input.eventLimit,
          input.phase
        )
      );
      return outcome.ok
        ? { ok: true }
        : {
            ok: false,
            retryAfterSeconds: retryAfter(outcome.resetAt, now()),
          };
    } catch (error) {
      console.warn('Meet guest join limiter unavailable; counting locally', {
        kind: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  if (input.requireSharedStore) return { ok: false, retryAfterSeconds: 60 };
  // The same windows as the store, all-or-nothing: a refused attempt counts
  // in neither.
  const at = now();
  const denied = localAttempts.hit(
    meetGuestJoinWindows(
      input.meetingId,
      network,
      input.eventLimit,
      input.phase
    )[0]!.windows.map((window) => ({
      key: `${network}:${window.key}`,
      limit: window.limit,
      windowMs: window.windowMs,
    })),
    at
  );
  return denied
    ? { ok: false, retryAfterSeconds: retryAfter(denied.resetAt, at) }
    : { ok: true };
}
