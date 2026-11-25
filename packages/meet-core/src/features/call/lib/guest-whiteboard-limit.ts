import type { GuardWindowSubject } from '@tuturuuu/utils/abuse-guard/client';
import { createExpiringMap } from '@tuturuuu/utils/abuse-guard/local-cache';
import type {
  MeetGuestJoinLimitDecision,
  MeetGuestJoinLimiter,
} from './guest-rate-limit';

/**
 * Whiteboard list and join calls one anonymous guest may make in one meeting
 * every minute. A guest's board renews its ticket every 30 seconds and the
 * picker lists every 15, so normal use stays well under it.
 */
export const MEET_GUEST_WHITEBOARD_LIMIT = 30;
export const MEET_GUEST_WHITEBOARD_WINDOW_MS = 60_000;

export function meetGuestWhiteboardWindows(
  meetingId: string,
  guestId: string
): GuardWindowSubject[] {
  return [
    {
      partition: `meet-guest-board:${guestId}`,
      windows: [
        {
          key: `board:${meetingId}:1m`,
          limit: MEET_GUEST_WHITEBOARD_LIMIT,
          windowMs: MEET_GUEST_WHITEBOARD_WINDOW_MS,
          algo: 'fixed',
        },
      ],
    },
  ];
}

type LocalWindow = { count: number; resetAt: number };
let localWindows = createExpiringMap<LocalWindow>(10_000);

/** Test hook: forget the per-isolate counts. */
export function resetMeetGuestWhiteboardLimiter() {
  localWindows = createExpiringMap<LocalWindow>(10_000);
}

const retryAfter = (resetAt: number, now: number) =>
  Math.max(1, Math.ceil((resetAt - now) / 1000));

/**
 * Charges one guest whiteboard call. The shared Durable Object store decides
 * when it is reachable; when it is unbound or failing the call is counted per
 * isolate in a bounded map instead of being let through uncounted.
 */
export async function checkMeetGuestWhiteboardLimit(
  input: { meetingId: string; guestId: string },
  limiter: MeetGuestJoinLimiter | null,
  now: () => number = Date.now
): Promise<MeetGuestJoinLimitDecision> {
  if (limiter) {
    try {
      const outcome = await limiter.hitWindows(
        meetGuestWhiteboardWindows(input.meetingId, input.guestId)
      );
      return outcome.ok
        ? { ok: true }
        : { ok: false, retryAfterSeconds: retryAfter(outcome.resetAt, now()) };
    } catch (error) {
      console.warn('Meet guest board limiter unavailable; counting locally', {
        kind: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  const key = `${input.meetingId}:${input.guestId}`;
  const at = now();
  const current = localWindows.get(key, at) ?? {
    count: 0,
    resetAt: at + MEET_GUEST_WHITEBOARD_WINDOW_MS,
  };
  if (current.count >= MEET_GUEST_WHITEBOARD_LIMIT)
    return { ok: false, retryAfterSeconds: retryAfter(current.resetAt, at) };
  localWindows.set(
    key,
    { count: current.count + 1, resetAt: current.resetAt },
    current.resetAt
  );
  return { ok: true };
}
