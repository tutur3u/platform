import type {
  GuardWindowOutcome,
  GuardWindowSubject,
} from '@tuturuuu/utils/abuse-guard/client';
import { createExpiringMap } from '@tuturuuu/utils/abuse-guard/local-cache';
import type {
  MeetGuestJoinLimitDecision,
  MeetGuestJoinLimiter,
} from './guest-rate-limit';

/**
 * Join requests that arrive without a Turnstile token (the check could not
 * load in the guest's browser) only ever reach the host's lobby. They are
 * charged on top of the ordinary join limit, with a tighter per-network
 * budget that the adaptive abuse decision can shrink further, and a
 * per-meeting cap so many networks together cannot flood one lobby.
 */
export const MEET_GUEST_UNVERIFIED_NETWORK_LIMIT = 3;
export const MEET_GUEST_UNVERIFIED_ROOM_LIMIT = 20;
export const MEET_GUEST_UNVERIFIED_WINDOW_MS = 10 * 60_000;

export function meetGuestUnverifiedWindows(
  meetingId: string,
  network: string,
  networkLimit = MEET_GUEST_UNVERIFIED_NETWORK_LIMIT
): GuardWindowSubject[] {
  return [
    {
      partition: `meet-guest-unverified-ip:${network}`,
      windows: [
        {
          key: `unverified:${meetingId}:10m`,
          limit: networkLimit,
          windowMs: MEET_GUEST_UNVERIFIED_WINDOW_MS,
          algo: 'fixed',
        },
      ],
    },
    {
      partition: `meet-guest-unverified-room:${meetingId}`,
      windows: [
        {
          key: 'unverified:10m',
          limit: MEET_GUEST_UNVERIFIED_ROOM_LIMIT,
          windowMs: MEET_GUEST_UNVERIFIED_WINDOW_MS,
          algo: 'fixed',
        },
      ],
    },
  ];
}

let localAttempts = createExpiringMap<number>(10_000);

/** Test hook: forget the per-isolate attempt counts. */
export function resetMeetGuestUnverifiedLimiter() {
  localAttempts = createExpiringMap<number>(10_000);
}

function retryAfter(resetAt: number, now: number) {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

/**
 * Charges one unverified join request. Like the ordinary join limit, a
 * missing or failing shared store falls back to per-isolate counts instead
 * of letting the request through uncounted.
 */
export async function checkMeetGuestUnverifiedLimit(
  input: {
    meetingId: string;
    network: string | undefined;
    networkLimit?: number;
  },
  limiter: MeetGuestJoinLimiter | null,
  now: () => number = Date.now
): Promise<MeetGuestJoinLimitDecision> {
  const network = input.network?.trim() || 'unknown';
  const networkLimit = Math.max(
    1,
    Math.min(
      MEET_GUEST_UNVERIFIED_NETWORK_LIMIT,
      input.networkLimit ?? MEET_GUEST_UNVERIFIED_NETWORK_LIMIT
    )
  );
  if (limiter) {
    try {
      const outcome: GuardWindowOutcome = await limiter.hitWindows(
        meetGuestUnverifiedWindows(input.meetingId, network, networkLimit)
      );
      return outcome.ok
        ? { ok: true }
        : { ok: false, retryAfterSeconds: retryAfter(outcome.resetAt, now()) };
    } catch (error) {
      console.warn(
        'Meet unverified guest limiter unavailable; counting locally',
        {
          kind: error instanceof Error ? error.name : 'unknown',
        }
      );
    }
  }
  const at = now();
  const networkKey = `ip:${input.meetingId}:${network}`;
  const roomKey = `room:${input.meetingId}`;
  const networkCount = localAttempts.get(networkKey, at) ?? 0;
  const roomCount = localAttempts.get(roomKey, at) ?? 0;
  if (
    networkCount >= networkLimit ||
    roomCount >= MEET_GUEST_UNVERIFIED_ROOM_LIMIT
  )
    return {
      ok: false,
      retryAfterSeconds: Math.ceil(MEET_GUEST_UNVERIFIED_WINDOW_MS / 1000),
    };
  const expiresAt = at + MEET_GUEST_UNVERIFIED_WINDOW_MS;
  localAttempts.set(networkKey, networkCount + 1, expiresAt);
  localAttempts.set(roomKey, roomCount + 1, expiresAt);
  return { ok: true };
}
