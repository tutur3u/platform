import { createMemoryStore, type HumanCheckStore } from '@tuturuuu/human-check';
import type { GuardWindowSubject } from '@tuturuuu/utils/abuse-guard/client';
import { createExpiringMap } from '@tuturuuu/utils/abuse-guard/local-cache';
import { meetAiUsageGuard } from '../../meeting-ai/server/usage-limit';
import type { MeetGuestJoinLimiter } from '../lib/guest-rate-limit';

/** Puzzles a network may request per meeting every ten minutes. */
export const MEET_HUMAN_CHECK_NETWORK_LIMIT = 6;
/** Puzzles a meeting may hand out across networks every ten minutes. */
export const MEET_HUMAN_CHECK_ROOM_LIMIT = 60;
/** Puzzles a network may request across all meetings every ten minutes. */
export const MEET_HUMAN_CHECK_NETWORK_TOTAL_LIMIT = 20;
/**
 * Placements a network may submit across all puzzles and meetings every ten
 * minutes. It bounds blind guessing and the verify route's work.
 */
export const MEET_HUMAN_CHECK_PLACEMENT_LIMIT = 6;
const WINDOW_MS = 10 * 60_000;

export const meetHumanCheckScope = (meetingId: string) => `meet:${meetingId}`;

/** The sealing and signing secret, or null when the puzzle is not configured. */
export function meetHumanCheckSecret() {
  const secret = process.env.HUMAN_CHECK_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

type GuardClient = MeetGuestJoinLimiter & {
  incr: (key: string, by: number, ttlMs: number) => Promise<{ n: number }>;
};

/** The shared abuse-guard client when Meet runs with its Durable Object. */
export async function meetHumanCheckGuard(): Promise<GuardClient | null> {
  try {
    const { selection } = await meetAiUsageGuard();
    return selection.kind === 'durable-object'
      ? (selection.client as GuardClient)
      : null;
  } catch {
    return null;
  }
}

const localStore = createMemoryStore();

/**
 * Attempt, single-use and pass counters. The shared store makes them
 * global; without it they hold per isolate and the short token lifetimes
 * bound any replay.
 */
export function meetHumanCheckStore(
  guard: GuardClient | null
): HumanCheckStore {
  if (!guard) return localStore;
  return {
    incr: async (key, ttlMs) => {
      try {
        return (await guard.incr(key, 1, Math.max(1000, ttlMs))).n;
      } catch (error) {
        console.warn('Meet human check store unavailable; counting locally', {
          kind: error instanceof Error ? error.name : 'unknown',
        });
        return localStore.incr(key, ttlMs);
      }
    },
  };
}

export function meetHumanCheckWindows(
  meetingId: string,
  network: string
): GuardWindowSubject[] {
  return [
    {
      partition: `meet-human-check-ip:${network}`,
      windows: [
        {
          key: `issue:${meetingId}:10m`,
          limit: MEET_HUMAN_CHECK_NETWORK_LIMIT,
          windowMs: WINDOW_MS,
          algo: 'fixed',
        },
      ],
    },
    {
      partition: `meet-human-check-net:${network}`,
      windows: [
        {
          key: 'issue:all:10m',
          limit: MEET_HUMAN_CHECK_NETWORK_TOTAL_LIMIT,
          windowMs: WINDOW_MS,
          algo: 'fixed',
        },
      ],
    },
    {
      partition: `meet-human-check-room:${meetingId}`,
      windows: [
        {
          key: 'issue:10m',
          limit: MEET_HUMAN_CHECK_ROOM_LIMIT,
          windowMs: WINDOW_MS,
          algo: 'fixed',
        },
      ],
    },
  ];
}

let localIssued = createExpiringMap<number>(10_000);

/** Test hook: forget per-isolate issuance counts. */
export function resetMeetHumanCheckIssuance() {
  localIssued = createExpiringMap<number>(10_000);
}

export type MeetHumanCheckIssuance =
  | { ok: true; level: 0 | 1 }
  | { ok: false; retryAfterSeconds: number };

/**
 * Charges one puzzle. After half the network budget the puzzle gets harder
 * (one more decoy, tighter tolerance); past the budget the network cools
 * down until the window resets.
 */
export async function chargeMeetHumanCheck(
  input: { meetingId: string; network: string | undefined },
  guard: MeetGuestJoinLimiter | null,
  now: () => number = Date.now
): Promise<MeetHumanCheckIssuance> {
  const network = input.network?.trim() || 'unknown';
  const half = MEET_HUMAN_CHECK_NETWORK_LIMIT / 2;
  if (guard) {
    try {
      const outcome = await guard.hitWindows(
        meetHumanCheckWindows(input.meetingId, network)
      );
      if (!outcome.ok)
        return {
          ok: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((outcome.resetAt - now()) / 1000)
          ),
        };
      const used =
        MEET_HUMAN_CHECK_NETWORK_LIMIT - (outcome.windows[0]?.remaining ?? 0);
      return { ok: true, level: used > half ? 1 : 0 };
    } catch (error) {
      console.warn('Meet human check limiter unavailable; counting locally', {
        kind: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  const at = now();
  const networkKey = `ip:${input.meetingId}:${network}`;
  const totalKey = `net:${network}`;
  const roomKey = `room:${input.meetingId}`;
  const issued = localIssued.get(networkKey, at) ?? 0;
  const total = localIssued.get(totalKey, at) ?? 0;
  const room = localIssued.get(roomKey, at) ?? 0;
  if (
    issued >= MEET_HUMAN_CHECK_NETWORK_LIMIT ||
    total >= MEET_HUMAN_CHECK_NETWORK_TOTAL_LIMIT ||
    room >= MEET_HUMAN_CHECK_ROOM_LIMIT
  )
    return { ok: false, retryAfterSeconds: WINDOW_MS / 1000 };
  localIssued.set(networkKey, issued + 1, at + WINDOW_MS);
  localIssued.set(totalKey, total + 1, at + WINDOW_MS);
  localIssued.set(roomKey, room + 1, at + WINDOW_MS);
  return { ok: true, level: issued + 1 > half ? 1 : 0 };
}

/** Charges one placement against the network's cross-meeting budget. */
export async function chargeMeetHumanCheckPlacement(
  network: string | undefined,
  guard: MeetGuestJoinLimiter | null,
  now: () => number = Date.now
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const subject = network?.trim() || 'unknown';
  if (guard) {
    try {
      const outcome = await guard.hitWindows([
        {
          partition: `meet-human-check-place:${subject}`,
          windows: [
            {
              key: 'place:10m',
              limit: MEET_HUMAN_CHECK_PLACEMENT_LIMIT,
              windowMs: WINDOW_MS,
              algo: 'fixed',
            },
          ],
        },
      ]);
      return outcome.ok
        ? { ok: true }
        : {
            ok: false,
            retryAfterSeconds: Math.max(
              1,
              Math.ceil((outcome.resetAt - now()) / 1000)
            ),
          };
    } catch (error) {
      console.warn(
        'Meet human check placement limiter unavailable; counting locally',
        {
          kind: error instanceof Error ? error.name : 'unknown',
        }
      );
    }
  }
  const at = now();
  const key = `place:${subject}`;
  const used = localIssued.get(key, at) ?? 0;
  if (used >= MEET_HUMAN_CHECK_PLACEMENT_LIMIT)
    return { ok: false, retryAfterSeconds: WINDOW_MS / 1000 };
  localIssued.set(key, used + 1, at + WINDOW_MS);
  return { ok: true };
}
