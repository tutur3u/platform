/**
 * Turns a `get_day_overview` tool result into the rows the agenda cards
 * render. Times arrive already formatted in the user's timezone
 * (`YYYY-MM-DDTHH:mm:ss±HH:mm`), so the wall-clock parts are read directly
 * instead of re-converting through the browser timezone.
 */

export type DayEventRow = {
  kind: 'event';
  id: string;
  title: string | null;
  start: string;
  end: string;
  location: string | null;
  href: string | null;
};

export type DayGapRow = {
  kind: 'gap';
  start: string;
  end: string;
  minutes: number;
};

export type DayTaskRow = {
  id: string;
  name: string;
  priority: 'critical' | 'high' | 'normal' | 'low' | null;
  dueDate: string;
  boardName: string | null;
  href: string | null;
};

export type DayOverview = {
  date: string;
  calendarHref: string | null;
  tasksHref: string | null;
  allDay: DayEventRow[];
  timeline: Array<DayEventRow | DayGapRow>;
  eventCount: number;
  calendarError: string | null;
  dueToday: DayTaskRow[];
  overdue: DayTaskRow[];
  overdueCount: number;
  dueTodayCount: number;
  tasksError: string | null;
  durationMs: number | null;
};

/** Free time is only shown inside the working day, in blocks worth using. */
export const WORKDAY = { startMinute: 9 * 60, endMinute: 18 * 60 } as const;
export const MIN_GAP_MINUTES = 30;

const LOCAL_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;
const WORKSPACE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const PRIORITIES = new Set(['critical', 'high', 'normal', 'low']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown) => (typeof value === 'string' ? value : null);

/** Minutes since local midnight on `date`; clamps other days to the edges. */
export function localMinute(value: string, date: string): number | null {
  const match = LOCAL_TIME.exec(value);
  if (!match) return null;
  const [, day, hours, minutes] = match;
  if (day! < date) return 0;
  if (day! > date) return 24 * 60;
  return Number(hours) * 60 + Number(minutes);
}

/** "HH:mm" wall-clock text of a formatted instant. */
export function localClock(value: string) {
  const match = LOCAL_TIME.exec(value);
  return match ? `${match[2]}:${match[3]}` : '';
}

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function freeGaps(events: DayEventRow[], date: string): DayGapRow[] {
  const busy = events
    .map((event) => [
      localMinute(event.start, date) ?? 0,
      localMinute(event.end, date) ?? 0,
    ])
    .sort((a, b) => a[0]! - b[0]!);
  const gaps: DayGapRow[] = [];
  let cursor: number = WORKDAY.startMinute;
  for (const [start, end] of busy) {
    const gapEnd = Math.min(start!, WORKDAY.endMinute);
    if (gapEnd - cursor >= MIN_GAP_MINUTES)
      gaps.push({
        kind: 'gap',
        start: clock(cursor),
        end: clock(gapEnd),
        minutes: gapEnd - cursor,
      });
    cursor = Math.max(cursor, end!);
  }
  if (WORKDAY.endMinute - cursor >= MIN_GAP_MINUTES)
    gaps.push({
      kind: 'gap',
      start: clock(cursor),
      end: clock(WORKDAY.endMinute),
      minutes: WORKDAY.endMinute - cursor,
    });
  return gaps;
}

function parseTask(
  value: unknown,
  wsSegment: string | null
): DayTaskRow | null {
  if (!isRecord(value)) return null;
  const id = str(value.id);
  const name = str(value.name);
  const dueDate = str(value.dueDate);
  if (!id || !name || !dueDate) return null;
  const priority = str(value.priority);
  return {
    id,
    name,
    priority:
      priority && PRIORITIES.has(priority)
        ? (priority as DayTaskRow['priority'])
        : null,
    dueDate,
    boardName: str(value.boardName),
    href: wsSegment ? `/${wsSegment}/tasks/${encodeURIComponent(id)}` : null,
  };
}

/** Returns null when the output is not a usable day overview. */
export function parseDayOverview(output: unknown): DayOverview | null {
  if (!isRecord(output) || output.success !== true) return null;
  const date = str(output.date);
  if (!date || !DATE_KEY.test(date)) return null;
  const wsId = str(output.wsId);
  const wsSegment = wsId && WORKSPACE_SEGMENT.test(wsId) ? wsId : null;
  const errors = isRecord(output.errors) ? output.errors : {};

  const calendar = isRecord(output.calendar) ? output.calendar : null;
  const allDay: DayEventRow[] = [];
  const timed: DayEventRow[] = [];
  for (const value of Array.isArray(calendar?.events) ? calendar.events : []) {
    if (!isRecord(value)) continue;
    const id = str(value.id);
    const start = str(value.start);
    const end = str(value.end);
    if (!id || !start || !end) continue;
    const row: DayEventRow = {
      kind: 'event',
      id,
      title: str(value.title),
      start,
      end,
      location: str(value.location),
      href: wsSegment
        ? `/${wsSegment}/calendar?eventId=${encodeURIComponent(id)}&date=${date}`
        : null,
    };
    const startMinute = localMinute(start, date) ?? 0;
    const endMinute = localMinute(end, date) ?? 0;
    (startMinute === 0 && endMinute === 24 * 60 ? allDay : timed).push(row);
  }
  timed.sort(
    (a, b) =>
      (localMinute(a.start, date) ?? 0) - (localMinute(b.start, date) ?? 0)
  );
  // Free time is only real when the calendar was actually read.
  const gaps = calendar && !errors.calendar ? freeGaps(timed, date) : [];
  const rowMinute = (row: DayEventRow | DayGapRow) =>
    row.kind === 'gap'
      ? Number(row.start.slice(0, 2)) * 60 + Number(row.start.slice(3, 5))
      : (localMinute(row.start, date) ?? 0);
  // Stable sort keeps an event ahead of a gap that starts at the same minute.
  const timeline = [...timed, ...gaps].sort(
    (a, b) => rowMinute(a) - rowMinute(b)
  );

  const tasks = isRecord(output.tasks) ? output.tasks : null;
  const counts = isRecord(tasks?.counts) ? tasks.counts : {};
  const parseList = (list: unknown) =>
    (Array.isArray(list) ? list : [])
      .map((task) => parseTask(task, wsSegment))
      .filter((task): task is DayTaskRow => task !== null);
  const overdue = parseList(tasks?.overdue);
  const dueToday = parseList(tasks?.dueOnDay);

  return {
    date,
    calendarHref: wsSegment ? `/${wsSegment}/calendar?date=${date}` : null,
    tasksHref: wsSegment ? `/${wsSegment}/tasks` : null,
    allDay,
    timeline,
    eventCount: allDay.length + timed.length,
    calendarError: str(errors.calendar),
    dueToday,
    overdue,
    overdueCount:
      typeof counts.overdue === 'number' ? counts.overdue : overdue.length,
    dueTodayCount:
      typeof counts.dueOnDay === 'number' ? counts.dueOnDay : dueToday.length,
    tasksError: str(errors.tasks),
    durationMs:
      typeof output.durationMs === 'number' && output.durationMs >= 0
        ? output.durationMs
        : null,
  };
}
