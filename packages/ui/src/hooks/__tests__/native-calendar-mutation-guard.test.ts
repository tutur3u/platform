import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { describe, expect, it } from 'vitest';
import {
  assertOrdinaryCalendarEvent,
  calendarEventByIdentity,
  cleanCalendarEventUpdates,
} from '../calendar-event-write-payload';

const virtual: CalendarEvent = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  seriesId: 'series',
  originalStartLocal: '2026-10-05T09:00:00',
  start_at: '2026-10-05T09:00:00Z',
  end_at: '2026-10-05T10:00:00Z',
};
describe('native virtual mutation fence', () => {
  it('resolves full UUID identities without truncating at the first dash', () => {
    expect(calendarEventByIdentity([virtual], virtual.id)).toBe(virtual);
  });
  it('rejects ordinary update/delete/drag identity paths for virtual rows and split rows', () => {
    expect(() => assertOrdinaryCalendarEvent([virtual], virtual.id)).toThrow();
    expect(() =>
      assertOrdinaryCalendarEvent(
        [{ ...virtual, id: 'split', _originalId: virtual.id }],
        virtual.id
      )
    ).toThrow();
  });
  it('preserves ordinary event mutation behavior', () => {
    expect(() =>
      assertOrdinaryCalendarEvent(
        [{ ...virtual, seriesId: undefined }],
        virtual.id
      )
    ).not.toThrow();
    expect(
      cleanCalendarEventUpdates({
        title: 'Title',
        seriesId: 'injected',
        originalStartLocal: 'injected',
        start_at: '2026-10-05T12:00:00Z',
      })
    ).toEqual({ title: 'Title', start_at: '2026-10-05T12:00:00Z' });
  });
});
