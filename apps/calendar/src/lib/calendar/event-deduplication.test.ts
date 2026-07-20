import { describe, expect, it } from 'vitest';
import { deduplicateCalendarEvents } from './event-deduplication';

const baseEvent = {
  description: '',
  end_at: '2026-07-21T02:00:00.000Z',
  location: null,
  provider: 'google',
  start_at: '2026-07-21T01:00:00.000Z',
  title: "Thanh Dat Nguyen's birthday",
};

describe('deduplicateCalendarEvents', () => {
  it('deduplicates the same provider event identity', () => {
    const events = [
      {
        ...baseEvent,
        external_calendar_id: 'birthdays',
        external_event_id: 'event-1',
        id: 'row-1',
      },
      {
        ...baseEvent,
        external_calendar_id: 'birthdays',
        external_event_id: 'event-1',
        id: 'row-2',
      },
    ];

    expect(deduplicateCalendarEvents(events)).toEqual([events[0]]);
  });

  it('deduplicates identical provider events imported through two accounts', () => {
    const events = [
      {
        ...baseEvent,
        external_calendar_id: 'account-a-birthdays',
        external_event_id: 'account-a-event',
        id: 'row-1',
      },
      {
        ...baseEvent,
        external_calendar_id: 'account-b-birthdays',
        external_event_id: 'account-b-event',
        id: 'row-2',
      },
    ];

    expect(deduplicateCalendarEvents(events)).toEqual([events[0]]);
  });

  it('preserves native events even when their visible fields match', () => {
    const events = [
      { ...baseEvent, id: 'native-1', provider: 'tuturuuu' },
      { ...baseEvent, id: 'native-2', provider: 'tuturuuu' },
    ];

    expect(deduplicateCalendarEvents(events)).toEqual(events);
  });

  it('preserves provider events when meaningful content differs', () => {
    const events = [
      { ...baseEvent, description: 'Personal', id: 'row-1' },
      { ...baseEvent, description: 'Team', id: 'row-2' },
    ];

    expect(deduplicateCalendarEvents(events)).toEqual(events);
  });
});
