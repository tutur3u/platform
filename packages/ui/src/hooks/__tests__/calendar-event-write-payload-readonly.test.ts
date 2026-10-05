import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { describe, expect, it } from 'vitest';
import { assertOrdinaryCalendarEvent } from '../calendar-event-write-payload';

const event = {
  id: 'instance',
  start_at: '2026-10-06T09:00:00Z',
  end_at: '2026-10-06T10:00:00Z',
  _originalId: 'original',
  scheduling_metadata: {
    provider_recurrence: {
      state: 'unsupported',
      provider: 'google',
      master_id: 'master',
    },
  },
} as CalendarEvent;
describe('provider readonly ordinary mutation fence', () => {
  it.each(['instance', 'original'])(
    'blocks updates/deletes by %s identity even if user unlocks the local event',
    (id) =>
      expect(() =>
        assertOrdinaryCalendarEvent([{ ...event, locked: false }], id)
      ).toThrow('read only')
  );
  it('permits an ordinary independently locked event', () =>
    expect(() =>
      assertOrdinaryCalendarEvent(
        [{ id: 'ordinary', locked: true } as CalendarEvent],
        'ordinary'
      )
    ).not.toThrow());
  it('retains the scoped native occurrence fence', () =>
    expect(() =>
      assertOrdinaryCalendarEvent(
        [{ id: 'native', seriesId: 'series' } as CalendarEvent],
        'native'
      )
    ).toThrow('explicit series edit scope'));
});
