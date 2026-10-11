import { describe, expect, it } from 'vitest';
import { calendarPreviewBlockedEvents } from './calendar-preview-blocked';

const now = new Date('2026-10-07T09:00:00Z');
const base = {
  id: 'meeting',
  start_at: '2026-10-07T10:00:00Z',
  end_at: '2026-10-07T11:00:00Z',
  locked: false,
};
describe('calendar task preview commitments', () => {
  it.each(['google', 'microsoft'] as const)(
    'blocks future unlocked %s meetings',
    (provider) => {
      expect(
        calendarPreviewBlockedEvents([{ ...base, provider }], now, new Set())
      ).toEqual([
        { id: 'meeting', start_at: base.start_at, end_at: base.end_at },
      ]);
    }
  );
  it.each([
    { source: { provider: 'google' as const, connectionId: 'connection' } },
    { google_event_id: 'legacy' },
    { external_event_id: 'external' },
  ])('preserves connected and legacy provider identity', (identity) => {
    expect(
      calendarPreviewBlockedEvents([{ ...base, ...identity }], now, new Set())
    ).toHaveLength(1);
  });
  it('ignores preview copies and allows replacement of future native task slots', () => {
    expect(
      calendarPreviewBlockedEvents(
        [
          { ...base, _isPreview: true, provider: 'google' },
          { ...base, id: 'task', provider: 'tuturuuu' },
        ],
        now,
        new Set()
      )
    ).toEqual([]);
  });
  it('retains locked, in-progress and habit events', () => {
    expect(
      calendarPreviewBlockedEvents(
        [
          { ...base, locked: true },
          { ...base, id: 'past', start_at: '2026-10-07T08:00:00Z' },
          { ...base, id: 'habit' },
        ],
        now,
        new Set(['habit'])
      )
    ).toHaveLength(3);
  });
});
