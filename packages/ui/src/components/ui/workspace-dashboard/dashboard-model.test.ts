import type { TaskWithRelations } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';
import { describe, expect, it } from 'vitest';
import {
  daysLate,
  eventsForToday,
  nowMarkerIndex,
  pickNextEvent,
  pickNextTask,
  type TaskDashboardData,
  toTaskRows,
} from './dashboard-model';

const at = (h: number, m = 0, dayOffset = 0) => {
  const d = new Date(2026, 10, 16 + dayOffset, h, m, 0, 0);
  return d.toISOString();
};
const now = new Date(2026, 10, 16, 19, 5);

const event = (id: string, start: string, end: string, extra = {}) =>
  ({ id, title: id, start_at: start, end_at: end, ...extra }) as CalendarEvent;

const task = (id: string, end: string | null, board = true) =>
  ({
    id,
    name: `Task ${id}`,
    end_date: end,
    list: board
      ? { name: 'List', board: { id: 'b1', ws_id: 'ws 1', name: 'Board' } }
      : null,
  }) as unknown as TaskWithRelations;

const feed = (partial: Partial<TaskDashboardData>): TaskDashboardData => ({
  overdue: [],
  today: [],
  upcoming: [],
  totalActiveTasks: 0,
  ...partial,
});

describe('agenda selection', () => {
  const events = [
    event('gym', at(21), at(22)),
    event('standup', at(9), at(9, 15)),
    event('planning', at(19), at(19, 45)),
    event('tomorrow', at(9, 0, 1), at(10, 0, 1)),
    event('holiday', at(0), at(0, 0, 1), { is_all_day: true }),
  ];

  it('keeps only events overlapping the local day, in start order', () => {
    expect(eventsForToday(events, now).map((e) => e.id)).toEqual([
      'holiday',
      'standup',
      'planning',
      'gym',
    ]);
  });

  it('prefers the timed event in progress over the next one', () => {
    expect(pickNextEvent(events, now)?.id).toBe('planning');
    expect(pickNextEvent(events, new Date(2026, 10, 16, 20))?.id).toBe('gym');
    expect(pickNextEvent(events, new Date(2026, 10, 16, 23))).toBeNull();
  });

  it('places the now marker before the first event that has not started', () => {
    const today = eventsForToday(events, now);
    expect(nowMarkerIndex(today, now)).toBe(3);
    expect(nowMarkerIndex(today, new Date(2026, 10, 16, 23))).toBe(4);
  });
});

describe('task rows', () => {
  it('counts whole local days late and ignores future dates', () => {
    expect(daysLate(at(10, 0, -2), now)).toBe(2);
    expect(daysLate(at(23, 0), now)).toBe(0);
    expect(daysLate(null, now)).toBe(0);
  });

  it('orders overdue, today, upcoming and caps the list', () => {
    const data = feed({
      overdue: [task('late', at(10, 0, -1))],
      today: [task('now', at(23))],
      upcoming: [task('soon', at(12, 0, 3), false)],
    });
    const rows = toTaskRows(data, now, 2);
    expect(rows.map((r) => [r.id, r.group, r.daysLate])).toEqual([
      ['late', 'overdue', 1],
      ['now', 'today', 0],
    ]);
    expect(rows[0]?.href).toBe('/ws%201/boards/b1?task=late');
    expect(toTaskRows(data, now)[2]?.href).toBeNull();
  });

  it('picks the most urgent task for Next up', () => {
    expect(pickNextTask(feed({}), now)).toBeNull();
    expect(
      pickNextTask(feed({ upcoming: [task('u', null)], today: [task('t', null)] }), now)?.id
    ).toBe('t');
  });
});
