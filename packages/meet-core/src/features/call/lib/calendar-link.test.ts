import { describe, expect, it } from 'vitest';
import { buildCalendarEventUrl } from './calendar-link';

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

  it('trims trailing slashes from long origins in linear time', () => {
    const event = { id: 'event', start_at: '2026-09-08T03:30:00.000Z' };
    expect(
      buildCalendarEventUrl('https://calendar.tuturuuu.com///', 'ws', event)
    ).toBe(
      'https://calendar.tuturuuu.com/ws?date=2026-09-08T03%3A30%3A00.000Z&eventId=event'
    );

    const startedAt = performance.now();
    expect(() =>
      buildCalendarEventUrl(`${'/'.repeat(100_000)}a`, 'ws', event)
    ).toThrow(TypeError);
    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});
