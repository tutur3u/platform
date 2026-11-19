import type {
  GuardWindowOutcome,
  GuardWindowSubject,
} from '@tuturuuu/utils/abuse-guard/client';
import { createExpiringMap } from '@tuturuuu/utils/abuse-guard/local-cache';

/** Five guest join attempts per network per meeting link every ten minutes. */
export const MEET_GUEST_JOIN_LIMIT = 5;
export const MEET_GUEST_JOIN_WINDOW_MS = 10 * 60_000;

export type MeetGuestJoinLimitDecision =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export type MeetGuestJoinLimiter = {
  hitWindows: (subjects: GuardWindowSubject[]) => Promise<GuardWindowOutcome>;
};

export function meetGuestJoinWindows(
  meetingId: string,
  network: string
): GuardWindowSubject[] {
  return [
    {
      partition: `meet-guest-ip:${network}`,
      windows: [
        {
          key: `join:${meetingId}:10m`,
          limit: MEET_GUEST_JOIN_LIMIT,
          windowMs: MEET_GUEST_JOIN_WINDOW_MS,
          algo: 'fixed',
        },
      ],
    },
  ];
}

let localAttempts = createExpiringMap<number>(10_000);

/** Test hook: forget the per-isolate attempt counts. */
export function resetMeetGuestJoinLimiter() {
  localAttempts = createExpiringMap<number>(10_000);
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
  input: { meetingId: string; network: string | undefined },
  limiter: MeetGuestJoinLimiter | null,
  now: () => number = Date.now
): Promise<MeetGuestJoinLimitDecision> {
  const network = input.network?.trim() || 'unknown';
  if (limiter) {
    try {
      const outcome = await limiter.hitWindows(
        meetGuestJoinWindows(input.meetingId, network)
      );
      return outcome.ok
        ? { ok: true }
        : { ok: false, retryAfterSeconds: retryAfter(outcome.resetAt, now()) };
    } catch (error) {
      console.warn('Meet guest join limiter unavailable; counting locally', {
        kind: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  const key = `${input.meetingId}:${network}`;
  const at = now();
  const count = localAttempts.get(key, at) ?? 0;
  if (count >= MEET_GUEST_JOIN_LIMIT)
    return {
      ok: false,
      retryAfterSeconds: Math.ceil(MEET_GUEST_JOIN_WINDOW_MS / 1000),
    };
  localAttempts.set(key, count + 1, at + MEET_GUEST_JOIN_WINDOW_MS);
  return { ok: true };
}
