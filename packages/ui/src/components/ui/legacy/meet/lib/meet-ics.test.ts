import { describe, expect, it, vi } from 'vitest';
import { createMeetIcs } from './meet-ics';

describe('Tuturuuu Meet ICS export', () => {
  it('creates one event per finalized alternative', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
    const ics = createMeetIcs({
      planId: 'plan-1',
      title: 'Design, review',
      timeframes: [
        {
          id: 'slot-1',
          plan_id: 'plan-1',
          start_at: '2026-08-04T02:00:00.000Z',
          end_at: '2026-08-04T03:00:00.000Z',
          position: 0,
          created_by: null,
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
        },
        {
          id: 'slot-2',
          plan_id: 'plan-1',
          start_at: '2026-08-05T02:00:00.000Z',
          end_at: '2026-08-05T03:00:00.000Z',
          position: 1,
          created_by: null,
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
        },
      ],
    });

    expect(ics.match(/BEGIN:VEVENT/gu)).toHaveLength(2);
    expect(ics).toContain('SUMMARY:Design\\, review');
    expect(ics).toContain('DTSTART:20260804T020000Z');
    vi.useRealTimers();
  });
});
