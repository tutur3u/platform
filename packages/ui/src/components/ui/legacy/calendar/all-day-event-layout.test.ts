import { isAllDayEvent } from '@tuturuuu/utils/calendar-utils';
import { describe, expect, it } from 'vitest';
import { calculateAllDayEventLayout } from './all-day-event-layout';

const date = (day: number) => new Date(2030, 0, day);
describe('all-day civil spans', () => {
  it.each([
    'America/Los_Angeles',
    'Pacific/Honolulu',
    'Asia/Ho_Chi_Minh',
    'Pacific/Kiritimati',
  ])('retains UTC date-only import civil dates in %s', (zone) => {
    const layout = calculateAllDayEventLayout(
      [
        {
          id: 'synthetic',
          title: 'Synthetic span',
          start_at: '2030-01-15T00:00:00Z',
          end_at: '2030-01-17T00:00:00Z',
        },
      ],
      [date(14), date(15), date(16), date(17)],
      zone,
      []
    );
    expect(
      layout.spans.map(({ startIndex, endIndex }) => [startIndex, endIndex])
    ).toEqual([[1, 2]]);
  });
});

it.each([
  ['2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 8],
  ['2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', 1],
])(
  'renders DST all-day midnights without fixed 24-hour arithmetic (%s)',
  (start_at, end_at, day) => {
    const event = {
      id: 'synthetic-dst',
      title: 'Synthetic DST',
      start_at: start_at as string,
      end_at: end_at as string,
    };
    const month = day === 8 ? 2 : 10;
    const dates = [
      new Date(2026, month, Number(day) - 1),
      new Date(2026, month, Number(day)),
      new Date(2026, month, Number(day) + 1),
    ];
    expect(isAllDayEvent(event, 'America/New_York')).toBe(true);
    expect(
      calculateAllDayEventLayout(
        [event],
        dates,
        'America/New_York',
        []
      ).spans.map(({ startIndex, endIndex }) => [startIndex, endIndex])
    ).toEqual([[1, 1]]);
  }
);
it('clips a long span with an exclusive end and retains cutoff flags', () => {
  const layout = calculateAllDayEventLayout(
    [
      {
        id: 'synthetic-long',
        title: 'Synthetic long',
        start_at: '2029-12-01T00:00:00Z',
        end_at: '2030-02-01T00:00:00Z',
      },
    ],
    [date(15), date(16), date(17)],
    'America/Los_Angeles',
    []
  );
  expect(layout.spans[0]).toMatchObject({
    startIndex: 0,
    endIndex: 2,
    isCutOffStart: true,
    isCutOffEnd: true,
  });
});
it('ignores invalid ranges and exclusive-end-only contact', () => {
  const events = [
    { id: 'invalid', start_at: 'invalid', end_at: 'invalid' },
    {
      id: 'ended',
      start_at: '2030-01-14T00:00:00Z',
      end_at: '2030-01-15T00:00:00Z',
    },
  ];
  expect(
    calculateAllDayEventLayout(events, [date(15)], 'Pacific/Honolulu', []).spans
  ).toEqual([]);
});
