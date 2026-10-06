import { describe, expect, it } from 'vitest';
import { calendarDayBoundary } from '../../../../lib/calendar-day';
import { calculateAllDayEventLayout } from './all-day-event-layout';
import { pastEventTreatment } from './past-event-treatment';

const event = {
  id: 'past',
  start_at: '2026-01-01T00:00:00Z',
  end_at: '2026-01-01T01:00:00Z',
};
const now = Date.parse('2026-01-02T00:00:00Z');
describe('past calendar treatment', () => {
  it('fades native events with an overlay above the opaque card', () => {
    expect(pastEventTreatment(event, false, false, now)).toContain(
      'after:bg-background/50'
    );
    expect(
      pastEventTreatment({ ...event, provider: 'tuturuuu' }, false, false, now)
    ).toContain('hover:after:opacity-0');
  });
  it('fades past events across imported providers', () => {
    for (const value of [
      { ...event, provider: 'google' as const },
      { ...event, provider: 'microsoft' as const },
      { ...event, google_event_id: 'synthetic-provider' },
    ]) {
      expect(pastEventTreatment(value, false, false, now)).toContain(
        'after:bg-background/50'
      );
    }
  });
  it('preserves explicit adapters and interaction/preview states', () => {
    expect(pastEventTreatment(event, true, false, now)).toBeUndefined();
    expect(pastEventTreatment(event, false, true, now)).toBeUndefined();
    for (const value of [
      { ...event, _isPreview: true },
      { ...event, _optimisticStatus: 'updating' },
    ]) {
      expect(pastEventTreatment(value, false, false, now)).toBeUndefined();
    }
    expect(
      pastEventTreatment(event, false, false, Date.parse(event.end_at))
    ).toBeUndefined();
  });
});

it('all-day fading follows displayed exclusive civil end rather than legacy UTC midnight', () => {
  const event = {
    id: 'synthetic-date',
    start_at: '2030-01-15T00:00:00Z',
    end_at: '2030-01-17T00:00:00Z',
  };
  const civilEnd = calendarDayBoundary(
    new Date(2030, 0, 17),
    'America/Los_Angeles'
  ).getTime();
  expect(
    pastEventTreatment(
      event,
      false,
      false,
      Date.parse('2030-01-17T04:00:00Z'),
      civilEnd
    )
  ).toBeUndefined();
  expect(
    pastEventTreatment(event, false, false, civilEnd, civilEnd)
  ).toBeUndefined();
  expect(
    pastEventTreatment(event, false, false, civilEnd + 1, civilEnd)
  ).toContain('after:bg-background/50');
});

it.each([
  ['2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', new Date(2026, 2, 8)],
  ['2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', new Date(2026, 10, 1)],
])(
  'all-day DST fading respects the actual exclusive midnight (%s)',
  (start_at, end_at, date) => {
    const event = {
      id: 'synthetic-dst',
      start_at: start_at as string,
      end_at: end_at as string,
    };
    const span = calculateAllDayEventLayout(
      [event],
      [date as Date],
      'America/New_York',
      []
    ).spans[0]!;
    const end = calendarDayBoundary(
      span.actualEndDate.toDate(),
      'America/New_York'
    ).getTime();
    expect(end).toBe(Date.parse(event.end_at));
    expect(pastEventTreatment(event, false, false, end, end)).toBeUndefined();
    expect(pastEventTreatment(event, false, false, end + 1, end)).toContain(
      'after:bg-background/50'
    );
  }
);
it('merged all-day span stays unfaded through its last civil day', () => {
  const events = [
    {
      id: 'first',
      title: 'Synthetic merged',
      start_at: '2030-01-15T00:00:00Z',
      end_at: '2030-01-16T00:00:00Z',
    },
    {
      id: 'second',
      title: 'Synthetic merged',
      start_at: '2030-01-16T00:00:00Z',
      end_at: '2030-01-17T00:00:00Z',
    },
  ];
  const span = calculateAllDayEventLayout(
    events,
    [new Date(2030, 0, 15), new Date(2030, 0, 16)],
    'America/Los_Angeles',
    []
  ).spans[0]!;
  expect(span.isMerged).toBe(true);
  const end = calendarDayBoundary(
    span.actualEndDate.toDate(),
    'America/Los_Angeles'
  ).getTime();
  expect(
    pastEventTreatment(
      span.event,
      false,
      false,
      Date.parse('2030-01-16T20:00:00Z'),
      end
    )
  ).toBeUndefined();
});
