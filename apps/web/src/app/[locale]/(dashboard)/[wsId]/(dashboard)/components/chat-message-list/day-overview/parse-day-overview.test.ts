import { describe, expect, it } from 'vitest';
import { localMinute, parseDayOverview } from './parse-day-overview';

const DATE = '2026-11-16';
const at = (time: string, day = DATE) => `${day}T${time}:00+07:00`;

const output = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  date: DATE,
  wsId: 'personal',
  timezone: 'Asia/Ho_Chi_Minh',
  durationMs: 412,
  calendar: {
    count: 4,
    events: [
      {
        id: 'e-home',
        title: 'Home',
        start: at('00:00'),
        end: at('00:00', '2026-11-17'),
      },
      {
        id: 'e-week',
        title: '[RMIT] Week 4',
        start: at('00:00'),
        end: at('00:00', '2026-11-23'),
      },
      {
        id: 'e-review',
        title: 'Design review',
        start: at('14:00'),
        end: at('15:00'),
      },
      { id: 'e-focus', title: 'Focus', start: at('09:30'), end: at('11:30') },
    ],
  },
  tasks: {
    dueOnDay: [],
    overdue: [
      {
        id: 't-1',
        name: 'Upskii hotfix',
        priority: 'critical',
        dueDate: at('17:00', '2026-11-13'),
        boardName: 'Upskii',
      },
      {
        id: 't-2',
        name: 'Bad priority',
        priority: 'urgent!',
        dueDate: at('09:00', '2026-11-14'),
      },
      { id: 'missing-name', dueDate: at('09:00', '2026-11-14') },
    ],
    counts: { dueOnDay: 0, overdue: 30 },
  },
  ...overrides,
});

describe('parseDayOverview', () => {
  it('splits all-day events from the timeline and adds working-day gaps', () => {
    const day = parseDayOverview(output())!;
    expect(day.allDay.map((event) => event.id)).toEqual(['e-home', 'e-week']);
    expect(
      day.timeline.map((row) =>
        row.kind === 'gap' ? `gap ${row.start}-${row.end}` : row.id
      )
    ).toEqual([
      'gap 09:00-09:30',
      'e-focus',
      'gap 11:30-14:00',
      'e-review',
      'gap 15:00-18:00',
    ]);
    expect(day.eventCount).toBe(4);
    expect(day.durationMs).toBe(412);
  });

  it('skips gaps shorter than 30 minutes and the time before 09:00', () => {
    const day = parseDayOverview(
      output({
        calendar: {
          events: [
            { id: 'a', title: 'A', start: at('07:00'), end: at('09:20') },
            { id: 'b', title: 'B', start: at('09:40'), end: at('18:00') },
          ],
        },
      })
    )!;
    expect(day.timeline.filter((row) => row.kind === 'gap')).toEqual([]);
  });

  it('builds workspace deep links and keeps the real overdue total', () => {
    const day = parseDayOverview(output())!;
    expect(day.timeline.find((row) => row.kind === 'event')).toMatchObject({
      href: '/personal/calendar?eventId=e-focus&date=2026-11-16',
    });
    expect(day.calendarHref).toBe('/personal/calendar?date=2026-11-16');
    expect(day.overdue).toEqual([
      {
        id: 't-1',
        name: 'Upskii hotfix',
        priority: 'critical',
        dueDate: at('17:00', '2026-11-13'),
        boardName: 'Upskii',
        href: '/personal/tasks/t-1',
      },
      expect.objectContaining({ id: 't-2', priority: null, boardName: null }),
    ]);
    expect(day.overdueCount).toBe(30);
  });

  it('omits links for an unsafe workspace id', () => {
    const day = parseDayOverview(output({ wsId: '../admin' }))!;
    expect(day.calendarHref).toBeNull();
    expect(day.overdue[0]?.href).toBeNull();
  });

  it('reports section errors and rejects unusable output', () => {
    const day = parseDayOverview(
      output({ calendar: null, errors: { calendar: 'No calendar access.' } })
    )!;
    expect(day.calendarError).toBe('No calendar access.');
    expect(day.timeline).toEqual([]);
    expect(parseDayOverview({ success: false })).toBeNull();
    expect(parseDayOverview({ success: true, date: 'today' })).toBeNull();
    expect(parseDayOverview('nope')).toBeNull();
  });
});

describe('localMinute', () => {
  it('reads wall-clock minutes and clamps other days', () => {
    expect(localMinute(at('14:05'), DATE)).toBe(845);
    expect(localMinute(at('23:00', '2026-11-15'), DATE)).toBe(0);
    expect(localMinute(at('01:00', '2026-11-17'), DATE)).toBe(1440);
  });
});
