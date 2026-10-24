import { describe, expect, it } from 'vitest';
import { buildCalendarEventUrl } from './calendar-link';
import { trimTrailingSlashes } from './trim-trailing-slashes';

describe('buildCalendarEventUrl', () => {
  it('deep-links the exact event and date in the selected workspace', () => {
    expect(
      buildCalendarEventUrl('https://calendar.tuturuuu.com/', 'personal', {
        id: 'event/id',
        start_at: '2026-09-08T03:30:00.000Z',
      })
    ).toBe(
      'https://calendar.tuturuuu.com/personal?date=2026-09-08T03%3A30%3A00.000Z&eventId=event%2Fid'
    );
  });

  it('trims long slash runs in linear time', () => {
    const origin = `https://calendar.tuturuuu.com${'/'.repeat(100_000)}x`;
    const startedAt = performance.now();
    expect(trimTrailingSlashes(`${origin}${'/'.repeat(100_000)}`)).toBe(origin);
    expect(trimTrailingSlashes(origin)).toBe(origin);
    expect(performance.now() - startedAt).toBeLessThan(500);
  });
});
