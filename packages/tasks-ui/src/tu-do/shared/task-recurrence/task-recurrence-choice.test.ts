import { describe, expect, it } from 'vitest';
import {
  buildTaskRecurrenceSchedule,
  defaultTaskRecurrenceCustomValues,
  previewTaskRecurrence,
  taskRecurrenceChoiceFromSchedule,
  taskRecurrenceScheduleAfter,
  taskRecurrenceTemplate,
  taskRecurrenceTemplatesDiffer,
  taskRecurrenceTimingFromDates,
  taskRecurrenceTimingFromSchedule,
} from './task-recurrence-choice';

const timing = (requestedDate: string, timeZone = 'Asia/Ho_Chi_Minh') => ({
  requestedDate,
  timeZone,
  dueTime: null,
  startOffsetDays: 0,
});

function schedule(...args: Parameters<typeof buildTaskRecurrenceSchedule>) {
  const result = buildTaskRecurrenceSchedule(...args);
  if (!result.ok) throw new Error(result.reason);
  return result.schedule;
}

describe('taskRecurrenceTimingFromDates', () => {
  it('uses the due date, its wall time, and the start offset', () => {
    expect(
      taskRecurrenceTimingFromDates({
        startDate: new Date('2026-11-19T02:00:00Z'),
        endDate: new Date('2026-11-21T09:30:00Z'),
        timeZone: 'Asia/Ho_Chi_Minh',
      })
    ).toEqual({
      requestedDate: '2026-11-21',
      timeZone: 'Asia/Ho_Chi_Minh',
      dueTime: '16:30',
      startOffsetDays: 2,
    });
  });

  it('treats an end-of-day due time as no due time', () => {
    const result = taskRecurrenceTimingFromDates({
      endDate: new Date('2026-11-21T16:59:59.999Z'),
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(result.requestedDate).toBe('2026-11-21');
    expect(result.dueTime).toBeNull();
  });

  it('falls back to today without dates', () => {
    const result = taskRecurrenceTimingFromDates({
      timeZone: 'UTC',
      now: new Date('2026-11-21T12:00:00Z'),
    });
    expect(result).toMatchObject({
      requestedDate: '2026-11-21',
      dueTime: null,
    });
  });
});

describe('buildTaskRecurrenceSchedule and preview', () => {
  it('previews three dates from a preset', () => {
    const weekly = schedule({ preset: 'weekly' }, timing('2026-11-21'));
    expect(previewTaskRecurrence(weekly, '2026-11-21')).toEqual({
      dates: [
        { date: '2026-11-21', skipped: false },
        { date: '2026-11-28', skipped: false },
        { date: '2026-12-05', skipped: false },
      ],
      requestedSkipped: false,
    });
  });

  it('marks a picked date that is not a repeat date as skipped', () => {
    const custom = {
      ...defaultTaskRecurrenceCustomValues('2026-11-21'),
      frequency: 'monthly' as const,
      monthDay: 31,
    };
    const monthly = schedule(
      { preset: 'custom', custom },
      timing('2026-11-21')
    );
    const preview = previewTaskRecurrence(monthly, '2026-11-21');
    expect(preview.requestedSkipped).toBe(true);
    // Day 31 clamps to the last day of shorter months.
    expect(preview.dates.map((item) => item.date)).toEqual([
      '2026-11-30',
      '2026-12-31',
      '2027-01-31',
    ]);
  });

  it('moves a weekend Weekdays start to Monday', () => {
    const weekdays = schedule({ preset: 'weekdays' }, timing('2026-11-21'));
    expect(weekdays.anchorDate).toBe('2026-11-23');
    expect(previewTaskRecurrence(weekdays, '2026-11-21').requestedSkipped).toBe(
      true
    );
  });

  it('flags a civil date absent in the zone', () => {
    const daily = schedule(
      { preset: 'daily' },
      timing('2011-12-29', 'Pacific/Apia')
    );
    expect(previewTaskRecurrence(daily, '2011-12-29').dates).toEqual([
      { date: '2011-12-29', skipped: false },
      { date: '2011-12-30', skipped: true },
      { date: '2011-12-31', skipped: false },
    ]);
  });

  it('rejects an end date beyond five years', () => {
    const custom = {
      ...defaultTaskRecurrenceCustomValues('2026-11-21'),
      end: { type: 'until' as const, date: '2032-01-01' },
    };
    expect(
      buildTaskRecurrenceSchedule(
        { preset: 'custom', custom },
        timing('2026-11-21')
      )
    ).toEqual({ ok: false, reason: 'until_range' });
  });

  it('round-trips a stored schedule to the picker', () => {
    const custom = {
      ...defaultTaskRecurrenceCustomValues('2026-11-21'),
      interval: 2,
      weekdays: ['MO' as const, 'SA' as const],
      end: { type: 'count' as const, count: 5 },
    };
    const built = schedule({ preset: 'custom', custom }, timing('2026-11-21'));
    expect(taskRecurrenceChoiceFromSchedule(built)).toEqual({
      preset: 'custom',
      custom,
    });
    expect(
      taskRecurrenceChoiceFromSchedule(
        schedule({ preset: 'monthly' }, timing('2026-11-21'))
      )
    ).toEqual({ preset: 'monthly' });
  });
});

describe('taskRecurrenceTemplate', () => {
  const input = {
    name: '  Weekly review ',
    description: null,
    priority: 'high' as const,
    estimationPoints: 3,
    labels: [{ id: 'b' }, { id: 'a' }, { id: 'a' }],
    projects: [],
    assignees: [{ id: 'member-row', user_id: 'user-1' }],
  };

  it('copies the creatable task fields with stable ids', () => {
    expect(taskRecurrenceTemplate(input)).toEqual({
      title: 'Weekly review',
      description: null,
      priority: 'high',
      estimate: 3,
      labels: ['a', 'b'],
      projects: [],
      assignees: ['user-1'],
    });
  });

  it('detects field edits but not id order', () => {
    const base = taskRecurrenceTemplate(input);
    expect(
      taskRecurrenceTemplatesDiffer(base, { ...base, labels: ['b', 'a'] })
    ).toBe(false);
    expect(
      taskRecurrenceTemplatesDiffer(base, { ...base, title: 'Other' })
    ).toBe(true);
  });
});

describe('editing from a task', () => {
  it('starts a changed schedule after dates the series already used', () => {
    const daily = schedule({ preset: 'daily' }, timing('2026-11-21'));
    expect(
      taskRecurrenceTimingFromSchedule(daily, '2026-11-21').requestedDate
    ).toBe('2026-11-22');
  });

  it('re-anchors a template edit on the next date, keeping the phase', () => {
    const custom = {
      ...defaultTaskRecurrenceCustomValues('2026-11-21'),
      interval: 2,
    };
    const biweekly = schedule(
      { preset: 'custom', custom },
      timing('2026-11-21')
    );
    expect(
      taskRecurrenceScheduleAfter(biweekly, '2026-11-21')?.anchorDate
    ).toBe('2026-12-05');
    const once = schedule(
      {
        preset: 'custom',
        custom: { ...custom, end: { type: 'count', count: 1 } },
      },
      timing('2026-11-21')
    );
    expect(taskRecurrenceScheduleAfter(once, '2026-11-21')).toBeNull();
  });
});
