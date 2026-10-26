import { describe, expect, it } from 'vitest';
import { normalizeSessionTags, sessionTagsSchema } from './session-tags';
import {
  computeTaggedTimeStats,
  localDate,
  taggedStatsLookbackDays,
} from './tagged-stats';

// Wednesday 2026-10-28, 09:00 in Ho Chi Minh City (02:00 UTC).
const now = new Date('2026-10-28T02:00:00Z');
const timezone = 'Asia/Ho_Chi_Minh';

function session(startUtc: string, minutes: number) {
  return { start_time: startUtc, duration_seconds: minutes * 60 };
}

describe('computeTaggedTimeStats', () => {
  it('totals today, the week from Monday and the month in local time', () => {
    const stats = computeTaggedTimeStats(
      [
        session('2026-10-28T01:00:00Z', 25), // today
        session('2026-10-27T18:00:00Z', 25), // today locally (01:00 +07)
        session('2026-10-26T03:00:00Z', 25), // Monday
        session('2026-10-25T03:00:00Z', 25), // Sunday: last week
        session('2026-10-01T03:00:00Z', 25), // this month
        session('2026-09-30T03:00:00Z', 25), // last month
      ],
      { timezone, now, daysBack: 7 }
    );

    expect(stats.todayTime).toBe(50 * 60);
    expect(stats.weekTime).toBe(75 * 60);
    expect(stats.monthTime).toBe(125 * 60);
  });

  it('lists daily activity newest first within daysBack', () => {
    const stats = computeTaggedTimeStats(
      [
        session('2026-10-28T01:00:00Z', 25),
        session('2026-10-28T01:30:00Z', 25),
        session('2026-10-26T03:00:00Z', 25),
        session('2026-10-10T03:00:00Z', 25),
      ],
      { timezone, now, daysBack: 7 }
    );

    expect(stats.dailyActivity).toEqual([
      { date: '2026-10-28', duration: 3000, sessions: 2 },
      { date: '2026-10-26', duration: 1500, sessions: 1 },
    ]);
  });

  it('counts a streak ending today or yesterday', () => {
    const days = (dates: string[]) =>
      dates.map((date) => session(`${date}T03:00:00Z`, 25));
    const options = { timezone, now, daysBack: 31 };

    expect(
      computeTaggedTimeStats(
        days(['2026-10-28', '2026-10-27', '2026-10-26', '2026-10-24']),
        options
      ).streak
    ).toBe(3);
    expect(
      computeTaggedTimeStats(days(['2026-10-27', '2026-10-26']), options).streak
    ).toBe(2);
    expect(computeTaggedTimeStats(days(['2026-10-26']), options).streak).toBe(
      0
    );
  });

  it('ignores unfinished, empty and future sessions', () => {
    const stats = computeTaggedTimeStats(
      [
        { start_time: '2026-10-28T01:00:00Z', duration_seconds: null },
        session('2026-10-28T01:00:00Z', 0),
        session('2026-10-29T03:00:00Z', 25),
      ],
      { timezone, now, daysBack: 7 }
    );

    expect(stats).toEqual({
      todayTime: 0,
      weekTime: 0,
      monthTime: 0,
      streak: 0,
      dailyActivity: [],
    });
  });

  it('reads at least a month of sessions', () => {
    expect(taggedStatsLookbackDays(0)).toBe(32);
    expect(taggedStatsLookbackDays(365)).toBe(366);
    expect(localDate(now, 'UTC')).toBe('2026-10-28');
  });
});

describe('session tags', () => {
  it('accepts lowercase slugs and rejects anything else', () => {
    expect(sessionTagsSchema.safeParse(['pomodoro', 'deep-work']).success).toBe(
      true
    );
    expect(sessionTagsSchema.safeParse(['Pomodoro']).success).toBe(false);
    expect(sessionTagsSchema.safeParse(['a b']).success).toBe(false);
    expect(
      sessionTagsSchema.safeParse(Array.from({ length: 11 }, () => 'x')).success
    ).toBe(false);
  });

  it('deduplicates tags and stores none as null', () => {
    expect(normalizeSessionTags(['pomodoro', 'pomodoro'])).toEqual([
      'pomodoro',
    ]);
    expect(normalizeSessionTags([])).toBeNull();
    expect(normalizeSessionTags(undefined)).toBeNull();
  });
});
