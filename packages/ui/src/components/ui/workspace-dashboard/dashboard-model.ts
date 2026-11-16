import type { TaskWithRelations } from '@tuturuuu/types';
import type { CalendarEvent } from '@tuturuuu/types/primitives/calendar-event';

export type TaskGroupKey = 'overdue' | 'today' | 'upcoming';

export interface TaskDashboardData {
  overdue: TaskWithRelations[];
  today: TaskWithRelations[];
  upcoming: TaskWithRelations[];
  totalActiveTasks: number;
}

export interface DashboardTaskRow {
  id: string;
  name: string;
  group: TaskGroupKey;
  context: string | null;
  endDate: string | null;
  href: string | null;
  daysLate: number;
  task: TaskWithRelations;
  /** False for tasks the user handed off; My Tasks restores those instead. */
  completable: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local-day window [start, end) for `now`, in the viewer's own time zone. */
export function localDayRange(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function startOfLocalDay(value: Date) {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Whole local days between a due date and today; 0 when not late. */
export function daysLate(endDate: string | null | undefined, now: Date) {
  if (!endDate) return 0;
  const due = new Date(endDate);
  if (Number.isNaN(due.getTime())) return 0;
  const diff = startOfLocalDay(now).getTime() - startOfLocalDay(due).getTime();
  return diff > 0 ? Math.round(diff / DAY_MS) : 0;
}

/** Board link used by Mira task artifacts; null when the task has no board. */
export function taskHref(task: TaskWithRelations) {
  const board = task.list?.board;
  if (!board?.ws_id || !board.id) return null;
  return `/${encodeURIComponent(board.ws_id)}/boards/${encodeURIComponent(board.id)}?task=${encodeURIComponent(task.id)}`;
}

/** Flattens the task feed into display rows, keeping group order and a cap. */
export function toTaskRows(
  data: TaskDashboardData,
  now: Date,
  limit = 8
): DashboardTaskRow[] {
  const groups: TaskGroupKey[] = ['overdue', 'today', 'upcoming'];
  return groups
    .flatMap((group) =>
      data[group].map((task) => ({
        id: task.id,
        name: task.name,
        group,
        context: task.list?.board?.name ?? task.list?.name ?? null,
        endDate: task.end_date ?? null,
        href: taskHref(task),
        daysLate: group === 'overdue' ? daysLate(task.end_date, now) : 0,
        task,
        completable: !task.overrides?.personally_unassigned,
      }))
    )
    .slice(0, limit);
}

/** Events that overlap the viewer's local today, ordered by start time. */
export function eventsForToday(events: CalendarEvent[], now: Date) {
  const { start, end } = localDayRange(now);
  return events
    .filter((event) => {
      const s = new Date(event.start_at).getTime();
      const e = new Date(event.end_at).getTime();
      return s < end.getTime() && e > start.getTime();
    })
    .sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );
}

/** The event in progress, or else the next one starting later today. */
export function pickNextEvent(events: CalendarEvent[], now: Date) {
  const time = now.getTime();
  return (
    eventsForToday(events, now).find(
      (event) =>
        !event.is_all_day && new Date(event.end_at).getTime() > time
    ) ?? null
  );
}

/** Index in today's events before which the current-time marker belongs. */
export function nowMarkerIndex(events: CalendarEvent[], now: Date) {
  const time = now.getTime();
  const index = events.findIndex(
    (event) => new Date(event.start_at).getTime() > time
  );
  return index === -1 ? events.length : index;
}

/** The most urgent task: earliest overdue, then today, then upcoming. */
export function pickNextTask(data: TaskDashboardData, now: Date) {
  return toTaskRows(data, now, 1)[0] ?? null;
}

export function minutesUntil(iso: string, now: Date) {
  return Math.max(
    0,
    Math.round((new Date(iso).getTime() - now.getTime()) / 60000)
  );
}

/** Whole hours and remaining minutes of a non-negative second count. */
export function splitDuration(seconds: number) {
  const total = Math.max(0, Math.floor((Number(seconds) || 0) / 60));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** Seconds elapsed since an ISO start time, never negative. */
export function secondsSince(iso: string | null | undefined, now: Date) {
  if (!iso) return 0;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now.getTime() - start) / 1000));
}

export interface DashboardGoal {
  is_active: boolean | null;
  category_id: string | null;
  daily_goal_minutes: number;
  weekly_goal_minutes: number | null;
}

/**
 * The active goal for all tracked time (no category), as Track shows it.
 * Category goals measure only that category, so they are not compared with
 * the overall daily total.
 */
export function pickOverallGoal<T extends DashboardGoal>(goals: T[]) {
  return (
    goals.find((goal) => goal.is_active && goal.category_id === null) ?? null
  );
}

/** Percent of a minute goal reached by tracked seconds, 0 to 100. */
export function goalPercent(trackedSeconds: number, goalMinutes: number) {
  if (!goalMinutes || goalMinutes <= 0) return 0;
  return Math.min(
    100,
    Math.round((trackedSeconds / 60 / goalMinutes) * 100)
  );
}

/** YYYY-MM-DD of `date` in `timeZone`. */
export function localDateKey(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * The seven local days ending today, oldest first, with the request window
 * that covers them (from local midnight six days ago to now).
 */
export function lastSevenDays(now: Date, timeZone: string) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - index));
    return { key: localDateKey(date, timeZone), date };
  });
  const from = new Date(now);
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { days, dateFrom: from.toISOString(), dateTo: now.toISOString() };
}

/** Calendar app deep link that opens one event (`?eventId=`). */
export function eventHref(calendarHref: string, eventId: string) {
  return `${calendarHref}?eventId=${encodeURIComponent(eventId)}`;
}

/** Calendar app entry that opens its own New event draft once (`?create=event`). */
export function newEventHref(calendarHref: string) {
  return `${calendarHref}?create=event`;
}
