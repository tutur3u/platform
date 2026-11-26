// @vitest-environment node
import { BOARD_GUEST_LIMITS } from '@tuturuuu/realtime/meet/board-sync-schema';
import {
  GUEST_ADDRESS_MULTIPLIER,
  GUEST_SCOPE_MULTIPLIER,
  guestLimiterSubjects,
} from '@tuturuuu/utils/api-proxy-guest-budget';
import type { RateLimitConfig } from '@tuturuuu/utils/api-proxy-guard';
import { describe, expect, it } from 'vitest';
import { CLASSROOM_REFRESH_MS } from '../../classroom-tools/classroom-client';
import { CONSENT_FAST_REFRESH_MS } from '../../meeting-ai/use-transcript-consent';
import {
  JOIN_SEED_REFRESH_MS,
  ROOM_MIRA_REFRESH_MS,
  ROOM_MIRA_SETTLING_REFRESH_MS,
} from '../components/use-room-mira';
import { BOARD_LIST_REFRESH_MS } from '../whiteboard/board-refresh';
import { POLLS_LIVE_REFRESH_MS } from './polls-client';

/**
 * A class of 50 guests behind one school NAT: five minutes in the lobby, where
 * the join seed is polled, then a 60-minute session at the worst case the call
 * polls with: a poll runs the whole time with its panel open, the classroom
 * pen board and the board list are both on screen, a transcript runs, and
 * Room Mira is polled, with a 30-second Mira settling burst on top, and every
 * guest draws on the classroom board for half an hour: 20 strokes a minute,
 * each a write followed by one re-read. Other writes are the board ticket
 * renewals and a vote a minute. Every
 * request is charged against the proxy guard's guest, network and meeting
 * budgets.
 */
const GUESTS = 50;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DURATION: Record<RateLimitConfig['duration'], number> = {
  '1 m': MINUTE,
  '1 h': HOUR,
  '1 d': 24 * HOUR,
};
/** Headroom every guest budget and shared cap keeps over this class. */
const HEADROOM = 1.5;
const LOBBY_MS = 5 * MINUTE;
const CALL_START = LOBBY_MS;
const CALL_END = CALL_START + HOUR;
/** Room Mira settles for 30 seconds half-way through the call. */
const SETTLING_START = CALL_START + 30 * MINUTE;
const SETTLING_END = SETTLING_START + 30_000;
/** Drawing on the classroom board, around the settling burst. */
const DRAWING_START = CALL_START + 15 * MINUTE;
const DRAWING_END = DRAWING_START + 30 * MINUTE;
const STROKE_MS = MINUTE / 20;
/** Each stroke is posted, then the board is read again. */
const REREAD_DELAY_MS = 500;
const READ_INTERVALS_MS = [
  POLLS_LIVE_REFRESH_MS,
  CLASSROOM_REFRESH_MS,
  CONSENT_FAST_REFRESH_MS,
  ROOM_MIRA_REFRESH_MS,
  BOARD_LIST_REFRESH_MS,
];
/** A guest's board ticket is renewed at half its lifetime. */
const TICKET_RENEW_MS = (BOARD_GUEST_LIMITS.ticketTtlSeconds * 1000) / 2;
const VOTE_MS = MINUTE;
const WRITE_INTERVALS_MS = [TICKET_RENEW_MS, VOTE_MS];

type Request = { at: number; guest: number; write: boolean };
type Poller = { every: number; from: number; to: number; write: boolean };

const POLLERS: Poller[] = [
  { every: JOIN_SEED_REFRESH_MS, from: 0, to: LOBBY_MS, write: false },
  ...READ_INTERVALS_MS.map((every) => ({
    every,
    from: CALL_START,
    to: CALL_END,
    write: false,
  })),
  {
    every: ROOM_MIRA_SETTLING_REFRESH_MS,
    from: SETTLING_START,
    to: SETTLING_END,
    write: false,
  },
  ...WRITE_INTERVALS_MS.map((every) => ({
    every,
    from: CALL_START,
    to: CALL_END,
    write: true,
  })),
  { every: STROKE_MS, from: DRAWING_START, to: DRAWING_END, write: true },
  {
    every: STROKE_MS,
    from: DRAWING_START + REREAD_DELAY_MS,
    to: DRAWING_END + REREAD_DELAY_MS,
    write: false,
  },
];

function schedule(): Request[] {
  const requests: Request[] = [];
  // Every guest polls in step, the worst alignment for the shared windows.
  for (let guest = 0; guest < GUESTS; guest++)
    for (const { every, from, to, write } of POLLERS)
      for (let at = from; at < to; at += every)
        requests.push({ at, guest, write });
  return requests.sort((a, b) => a.at - b.at);
}

/** Sliding windows with O(1) amortised hits; tracks each key's peak count. */
function slidingWindows() {
  const windows = new Map<string, { hits: number[]; head: number }>();
  const peaks = new Map<string, number>();
  return {
    charge(key: string, limit: number, span: number, now: number) {
      const window = windows.get(key) ?? { hits: [], head: 0 };
      windows.set(key, window);
      while (
        window.head < window.hits.length &&
        window.hits[window.head]! <= now - span
      )
        window.head++;
      const live = window.hits.length - window.head;
      if (live >= limit) return false;
      window.hits.push(now);
      peaks.set(key, Math.max(peaks.get(key) ?? 0, live + 1));
      return true;
    },
    peak: (key: string) => peaks.get(key) ?? 0,
  };
}

describe('a 50-guest class behind one network', () => {
  it('stays under every guest budget with headroom on the shared caps', () => {
    const windows = slidingWindows();
    const meeting = '00000000-0000-4000-8000-000000000001';
    const network = 'ip:203.0.113.10';
    const keyOf = (prefix: string, kind: string, config: RateLimitConfig) =>
      `${prefix}:${kind}:${config.window}`;
    let refused = 0;
    let limits: ReturnType<typeof guestLimiterSubjects> = [];
    for (const { at, guest, write } of schedule()) {
      limits = guestLimiterSubjects(
        'proxy:meet:api',
        'default',
        { scopeId: meeting, guestId: `guest-${guest}` },
        network
      );
      const kind = write ? 'mutate' : 'get';
      for (const subject of limits) {
        const ok = subject.rateLimits[kind].every((config) =>
          windows.charge(
            `${keyOf(subject.prefix, kind, config)}|${subject.id}`,
            config.limit,
            DURATION[config.duration],
            at
          )
        );
        if (!ok) {
          refused++;
          break;
        }
      }
    }
    expect(refused).toBe(0);

    // Each guest's own budget keeps 1.5x over its peak reads and hourly writes.
    const [guestSubject, networkSubject, meetingSubject] = limits;
    const own: Record<string, number> = {};
    for (const kind of ['get', 'mutate'] as const)
      for (const config of guestSubject!.rateLimits[kind]) {
        const peak = windows.peak(
          `${keyOf(guestSubject!.prefix, kind, config)}|${guestSubject!.id}`
        );
        own[`${kind}:${config.window}`] = peak;
        expect(config.limit / peak).toBeGreaterThanOrEqual(HEADROOM);
      }
    expect(own).toEqual({
      'get:minute': 97,
      'get:hour': 4335,
      'get:day': 4350,
      'mutate:minute': 23,
      'mutate:hour': 780,
      'mutate:day': 780,
    });

    // The shared caps keep at least 1.5x over the class's peak demand.
    expect(networkSubject!.rateLimits.get[1]!.limit).toBeLessThan(
      meetingSubject!.rateLimits.get[1]!.limit
    );
    expect(networkSubject?.id).toBe('guest-net:203.0.113.10');
    expect(meetingSubject?.id).toBe(`guest-scope:${meeting}`);
    expect(GUEST_ADDRESS_MULTIPLIER).toBeLessThan(GUEST_SCOPE_MULTIPLIER);
    const peaks: Record<string, number> = {};
    for (const subject of [networkSubject!, meetingSubject!])
      for (const kind of ['get', 'mutate'] as const)
        for (const config of subject.rateLimits[kind]) {
          const peak = windows.peak(
            `${keyOf(subject.prefix, kind, config)}|${subject.id}`
          );
          peaks[`${kind}:${config.window}`] = peak;
          expect(config.limit / peak).toBeGreaterThanOrEqual(HEADROOM);
        }
    // The class's peak demand, as stated in the Meet calls page.
    expect(peaks).toEqual({
      'get:minute': 4850,
      'get:hour': 216_750,
      'mutate:minute': 1150,
      'mutate:hour': 39_000,
    });
  });
});
