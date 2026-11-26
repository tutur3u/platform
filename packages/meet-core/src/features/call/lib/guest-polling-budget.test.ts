// @vitest-environment node
import {
  guestLimiterSubjects,
  type VerifiedGuestActor,
} from '@tuturuuu/utils/api-proxy-guest-budget';
import { describe, expect, it } from 'vitest';
import { CLASSROOM_REFRESH_MS } from '../../classroom-tools/classroom-client';
import {
  CONSENT_FAST_REFRESH_MS,
  CONSENT_SLOW_REFRESH_MS,
} from '../../meeting-ai/use-transcript-consent';
import { ROOM_MIRA_REFRESH_MS } from '../components/use-room-mira';
import { BOARD_LIST_REFRESH_MS } from '../whiteboard/board-refresh';
import { POLLS_IDLE_REFRESH_MS, POLLS_LIVE_REFRESH_MS } from './polls-client';

/**
 * Two admitted guests behind one school NAT through a 60-minute class, at
 * the intervals the call actually polls with. Every read is charged against
 * the proxy guard's guest subjects with sliding windows.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DURATION: Record<string, number> = {
  '1 m': MINUTE,
  '1 h': HOUR,
  '1 d': 24 * HOUR,
};

type Poller = { every: number; from: number; to: number };

/** A guest's GETs: one schedule per polled endpoint. */
function guestSchedule(offset: number): Poller[] {
  return [
    // Polls: idle, then a 10-minute live poll with the panel open.
    { every: POLLS_IDLE_REFRESH_MS, from: 0, to: 20 * MINUTE },
    { every: POLLS_LIVE_REFRESH_MS, from: 20 * MINUTE, to: 30 * MINUTE },
    { every: POLLS_IDLE_REFRESH_MS, from: 30 * MINUTE, to: HOUR },
    // A transcript runs the whole class, so consent stays on the fast read;
    // the slow read covers the minutes before it starts.
    { every: CONSENT_SLOW_REFRESH_MS, from: 0, to: 5 * MINUTE },
    { every: CONSENT_FAST_REFRESH_MS, from: 5 * MINUTE, to: HOUR },
    { every: ROOM_MIRA_REFRESH_MS, from: 0, to: HOUR },
    // The board list while the picker is open, then the classroom pen board.
    { every: BOARD_LIST_REFRESH_MS, from: 0, to: 15 * MINUTE },
    { every: CLASSROOM_REFRESH_MS, from: 15 * MINUTE, to: 45 * MINUTE },
  ].map((poller) => ({ ...poller, from: poller.from + offset }));
}

function readTimes(schedule: Poller[]) {
  const times: number[] = [];
  for (const { every, from, to } of schedule)
    for (let at = from; at < to; at += every) times.push(at);
  return times.sort((a, b) => a - b);
}

function slidingWindows() {
  const hits = new Map<string, number[]>();
  return (key: string, limit: number, span: number, now: number) => {
    const live = (hits.get(key) ?? []).filter((at) => at > now - span);
    const ok = live.length < limit;
    if (ok) live.push(now);
    hits.set(key, live);
    return ok;
  };
}

describe('guest polling against the guest budget', () => {
  it('keeps two guests on one IP under every limit for a 60-minute class', () => {
    const charge = slidingWindows();
    const meeting = '00000000-0000-4000-8000-000000000001';
    const guests: VerifiedGuestActor[] = ['guest-a', 'guest-b'].map(
      (guestId) => ({ scopeId: meeting, guestId })
    );
    const reads = guests
      .flatMap((guest, index) =>
        readTimes(guestSchedule(index * 1_700)).map((at) => ({ at, guest }))
      )
      .sort((a, b) => a.at - b.at);
    let refused = 0;
    for (const { at, guest } of reads) {
      const subjects = guestLimiterSubjects(
        'proxy:meet:api',
        'default',
        guest,
        'ip:203.0.113.10'
      );
      for (const subject of subjects) {
        const ok = subject.rateLimits.get.every((config) =>
          charge(
            `${subject.prefix}:${config.window}|${subject.id}`,
            config.limit,
            DURATION[config.duration]!,
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
    // The same hour would have spent the anonymous address budget (240 per
    // hour) many times over.
    expect(reads.length).toBeGreaterThan(240 * 10);
  });
});
