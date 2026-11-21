import {
  nextTaskOccurrenceDate,
  type TaskRecurrenceSchedule,
  taskOccurrenceInstants,
} from '@tuturuuu/utils/task-recurrence';

function localDate(instant: string, timeZone: string) {
  const dateParts = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    calendar: 'iso8601',
    timeZone,
  }).formatToParts(new Date(instant));
  const read = (part: string) =>
    dateParts.find(({ type }) => type === part)?.value;
  return `${read('year')}-${read('month')}-${read('day')}`;
}

export function planRecurrenceStep(
  schedule: TaskRecurrenceSchedule,
  date = schedule.anchorDate,
  consumed = 0
) {
  const timing = {
    timeZone: schedule.rule.timeZone,
    dueTime: schedule.dueTime,
    startOffsetDays: schedule.startOffsetDays,
  };
  const current = taskOccurrenceInstants(timing, date);
  const candidate =
    schedule.rule.end.type === 'count' &&
    consumed + 1 >= schedule.rule.end.count
      ? null
      : nextTaskOccurrenceDate(schedule, { after: date });
  const next =
    candidate && /^[0-9]{4}-/.test(candidate) && candidate <= '2999-12-31'
      ? candidate
      : null;
  const dueDayStart = taskOccurrenceInstants(
    { ...timing, startOffsetDays: 0 },
    date
  ).generateAt;
  const skip =
    localDate(current.generateAt, timing.timeZone) !== current.startDate ||
    localDate(dueDayStart, timing.timeZone) !== current.occurrenceDate;
  return {
    version: 1,
    date,
    next_date: next,
    next_at: next ? taskOccurrenceInstants(timing, next).generateAt : null,
    start_at: skip ? null : current.startAt,
    end_at: skip ? null : current.endAt,
    anchor_at: current.generateAt,
    skip,
  };
}
