import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import dayjs from 'dayjs';

export type TimelineInteractionMode = 'move' | 'resize-start' | 'resize-end';

export interface TimelineItem {
  task: Task;
  list: TaskList | null;
  start: Date;
  end: Date;
  durationDays: number;
  offsetDays: number;
  isPast: boolean;
  isOngoing: boolean;
  isFuture: boolean;
}

export interface TimelineLaneItem extends TimelineItem {
  rowIndex: number;
}

export interface TimelineGroup {
  id: string;
  list: TaskList | null;
  items: TimelineLaneItem[];
  rowCount: number;
}

export interface MonthSegment {
  key: string;
  start: Date;
  startIndex: number;
  days: number;
}

export interface TimelineSpansResult {
  spans: Array<
    TimelineItem & {
      rowIndex: number;
    }
  >;
  unscheduled: Task[];
  minDate: Date;
  maxDate: Date;
  rowCount: number;
}

export interface TimelineModel {
  groups: TimelineGroup[];
  unscheduled: Task[];
  days: Date[];
  monthSegments: MonthSegment[];
  rangeStart: Date;
  rangeEnd: Date;
  scheduledCount: number;
  todayIndex: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PAST_PADDING_DAYS = 3;
const DEFAULT_FUTURE_PADDING_DAYS = 6;
const EMPTY_PAST_PADDING_DAYS = 7;
const EMPTY_FUTURE_PADDING_DAYS = 14;
const TIMELINE_LIST_STATUS_ORDER: Record<string, number> = {
  not_started: 0,
  active: 1,
  done: 2,
  closed: 3,
};

function normalizeTaskRange(task: Task, todayMid: dayjs.Dayjs) {
  if (!task.start_date && !task.end_date) {
    return null;
  }

  const first = dayjs(task.start_date || task.end_date || todayMid.toDate());
  const second = dayjs(task.end_date || task.start_date || first.toDate());
  const start = first.isAfter(second)
    ? second.startOf('day')
    : first.startOf('day');
  const end = second.isBefore(first)
    ? first.startOf('day')
    : second.startOf('day');

  return {
    start: start.toDate(),
    end: end.toDate(),
    durationDays: Math.max(1, end.diff(start, 'day') + 1),
  };
}

export function enumerateDays(start: Date, end: Date) {
  const days: Date[] = [];
  let cursor = dayjs(start).startOf('day');
  const endDate = dayjs(end).startOf('day');

  while (cursor.isBefore(endDate) || cursor.isSame(endDate, 'day')) {
    days.push(cursor.toDate());
    cursor = cursor.add(1, 'day');
  }

  return days;
}

export function buildMonthSegments(days: Date[]) {
  const segments: MonthSegment[] = [];

  for (const [index, day] of days.entries()) {
    const key = dayjs(day).format('YYYY-MM');
    const last = segments[segments.length - 1];

    if (last?.key === key) {
      last.days += 1;
      continue;
    }

    segments.push({
      key,
      start: day,
      startIndex: index,
      days: 1,
    });
  }

  return segments;
}

function withLaneRows(
  items: Array<Omit<TimelineItem, 'offsetDays'>>,
  rangeStart: Date
): { items: TimelineLaneItem[]; rowCount: number } {
  const rowEnds: Date[] = [];

  const packedItems = items.map((item) => {
    let rowIndex = rowEnds.findIndex(
      (rowEnd) => rowEnd.getTime() < item.start.getTime()
    );

    if (rowIndex === -1) {
      rowIndex = rowEnds.length;
      rowEnds.push(item.end);
    } else {
      rowEnds[rowIndex] = item.end;
    }

    return {
      ...item,
      rowIndex,
      offsetDays: Math.floor(
        (item.start.getTime() - rangeStart.getTime()) / DAY_MS
      ),
    };
  });

  return {
    items: packedItems,
    rowCount: Math.max(1, rowEnds.length),
  };
}

export function computeTimelineSpans(
  tasks: Task[],
  lists: TaskList[]
): TimelineSpansResult {
  const listById = new Map(
    lists.map((list) => [String(list.id), list] as const)
  );
  const todayMid = dayjs().startOf('day');
  const scheduled: TimelineSpansResult['spans'] = [];
  const unscheduled: Task[] = [];

  for (const task of tasks) {
    const range = normalizeTaskRange(task, todayMid);

    if (!range) {
      unscheduled.push(task);
      continue;
    }

    const startDay = dayjs(range.start);
    const endDay = dayjs(range.end);

    scheduled.push({
      task,
      list: listById.get(String(task.list_id)) ?? null,
      start: range.start,
      end: range.end,
      durationDays: range.durationDays,
      rowIndex: 0,
      offsetDays: 0,
      isPast: endDay.isBefore(todayMid),
      isOngoing: !startDay.isAfter(todayMid) && !endDay.isBefore(todayMid),
      isFuture: startDay.isAfter(todayMid),
    });
  }

  scheduled.sort((left, right) => {
    const startDiff = left.start.getTime() - right.start.getTime();
    if (startDiff !== 0) return startDiff;

    const endDiff = left.end.getTime() - right.end.getTime();
    if (endDiff !== 0) return endDiff;

    return left.task.name.localeCompare(right.task.name);
  });

  const rowEnds: Date[] = [];
  for (const span of scheduled) {
    let rowIndex = rowEnds.findIndex(
      (rowEnd) => rowEnd.getTime() < span.start.getTime()
    );
    if (rowIndex === -1) {
      rowIndex = rowEnds.length;
      rowEnds.push(span.end);
    } else {
      rowEnds[rowIndex] = span.end;
    }
    span.rowIndex = rowIndex;
  }

  const minDate = scheduled.length
    ? scheduled.reduce(
        (min, span) => (span.start < min ? span.start : min),
        scheduled[0]!.start
      )
    : todayMid.toDate();
  const maxDate = scheduled.length
    ? scheduled.reduce(
        (max, span) => (span.end > max ? span.end : max),
        scheduled[0]!.end
      )
    : todayMid.toDate();

  return {
    spans: scheduled,
    unscheduled,
    minDate,
    maxDate,
    rowCount: Math.max(1, rowEnds.length),
  };
}

export function buildTimelineModel(
  tasks: Task[],
  lists: TaskList[]
): TimelineModel {
  const sortedLists = lists
    .map((list, index) => ({ list, index }))
    .sort((left, right) => {
      const leftRank =
        TIMELINE_LIST_STATUS_ORDER[left.list.status ?? ''] ??
        Number.MAX_SAFE_INTEGER;
      const rightRank =
        TIMELINE_LIST_STATUS_ORDER[right.list.status ?? ''] ??
        Number.MAX_SAFE_INTEGER;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.index - right.index;
    })
    .map(({ list }) => list);

  const listById = new Map(
    sortedLists.map((list) => [String(list.id), list] as const)
  );
  const todayMid = dayjs().startOf('day');
  const scheduled: Array<Omit<TimelineItem, 'offsetDays'>> = [];
  const unscheduled: Task[] = [];

  for (const task of tasks) {
    const range = normalizeTaskRange(task, todayMid);

    if (!range) {
      unscheduled.push(task);
      continue;
    }

    const startDay = dayjs(range.start);
    const endDay = dayjs(range.end);

    scheduled.push({
      task,
      list: listById.get(String(task.list_id)) ?? null,
      start: range.start,
      end: range.end,
      durationDays: range.durationDays,
      isPast: endDay.isBefore(todayMid),
      isOngoing: !startDay.isAfter(todayMid) && !endDay.isBefore(todayMid),
      isFuture: startDay.isAfter(todayMid),
    });
  }

  const rangeStart = scheduled.length
    ? dayjs(
        scheduled.reduce(
          (min, item) => (item.start < min ? item.start : min),
          scheduled[0]!.start
        )
      )
        .subtract(DEFAULT_PAST_PADDING_DAYS, 'day')
        .startOf('day')
        .toDate()
    : todayMid.subtract(EMPTY_PAST_PADDING_DAYS, 'day').toDate();

  const rangeEnd = scheduled.length
    ? dayjs(
        scheduled.reduce(
          (max, item) => (item.end > max ? item.end : max),
          scheduled[0]!.end
        )
      )
        .add(DEFAULT_FUTURE_PADDING_DAYS, 'day')
        .startOf('day')
        .toDate()
    : todayMid.add(EMPTY_FUTURE_PADDING_DAYS, 'day').toDate();

  const days = enumerateDays(rangeStart, rangeEnd);
  const monthSegments = buildMonthSegments(days);
  const todayIndex = Math.round(
    (todayMid.toDate().getTime() - rangeStart.getTime()) / DAY_MS
  );

  const groups: TimelineGroup[] = sortedLists.map((list) => {
    const scheduledItems = scheduled
      .filter((item) => item.task.list_id === list.id)
      .sort((left, right) => {
        const startDiff = left.start.getTime() - right.start.getTime();
        if (startDiff !== 0) return startDiff;

        const durationDiff = right.durationDays - left.durationDays;
        if (durationDiff !== 0) return durationDiff;

        return left.task.name.localeCompare(right.task.name);
      });

    const { items, rowCount } = withLaneRows(scheduledItems, rangeStart);

    return {
      id: String(list.id),
      list,
      items,
      rowCount,
    };
  });

  const orphanScheduledItems = scheduled
    .filter((item) => !listById.has(String(item.task.list_id)))
    .sort((left, right) => left.start.getTime() - right.start.getTime());

  const { items: orphanItems, rowCount: orphanRowCount } = withLaneRows(
    orphanScheduledItems,
    rangeStart
  );

  if (orphanItems.length > 0) {
    groups.push({
      id: 'unknown-list',
      list: null,
      items: orphanItems,
      rowCount: orphanRowCount,
    });
  }

  return {
    groups,
    unscheduled,
    days,
    monthSegments,
    rangeStart,
    rangeEnd,
    scheduledCount: scheduled.length,
    todayIndex,
  };
}

function applyOriginalTime(
  draft: dayjs.Dayjs,
  original: dayjs.Dayjs | null,
  fallback: 'start' | 'end'
) {
  if (!original) {
    return fallback === 'start' ? draft.startOf('day') : draft.endOf('day');
  }

  const originalIsStartBoundary =
    original.valueOf() === original.startOf('day').valueOf();
  const originalIsEndBoundary =
    original.valueOf() === original.endOf('day').valueOf();

  if (originalIsStartBoundary) {
    return draft.startOf('day');
  }

  if (originalIsEndBoundary) {
    return draft.endOf('day');
  }

  return draft
    .hour(original.hour())
    .minute(original.minute())
    .second(original.second())
    .millisecond(original.millisecond());
}

export function deriveDraftRange({
  task,
  mode,
  dayDelta,
  originalStart,
  originalEnd,
}: {
  task: Task;
  mode: TimelineInteractionMode;
  dayDelta: number;
  originalStart: Date;
  originalEnd: Date;
}) {
  const originalTaskStart = task.start_date ? dayjs(task.start_date) : null;
  const originalTaskEnd = task.end_date ? dayjs(task.end_date) : null;
  let nextStart = dayjs(originalStart);
  let nextEnd = dayjs(originalEnd);

  switch (mode) {
    case 'move':
      nextStart = applyOriginalTime(
        nextStart.add(dayDelta, 'day'),
        originalTaskStart,
        'start'
      );
      nextEnd = applyOriginalTime(
        nextEnd.add(dayDelta, 'day'),
        originalTaskEnd,
        'end'
      );
      break;
    case 'resize-start':
      nextStart = applyOriginalTime(
        nextStart.add(dayDelta, 'day'),
        originalTaskStart,
        'start'
      );
      if (nextStart.isAfter(nextEnd)) {
        nextStart = applyOriginalTime(nextEnd, originalTaskStart, 'start');
      }
      break;
    case 'resize-end':
      nextEnd = applyOriginalTime(
        nextEnd.add(dayDelta, 'day'),
        originalTaskEnd,
        'end'
      );
      if (nextEnd.isBefore(nextStart)) {
        nextEnd = applyOriginalTime(nextStart, originalTaskEnd, 'end');
      }
      break;
  }

  return {
    start: nextStart.toDate(),
    end: nextEnd.toDate(),
  };
}

export function pixelToDayDelta(px: number, dayWidth: number) {
  if (dayWidth <= 0) return 0;
  const ratio = px / dayWidth;
  if (Math.abs(ratio) < 0.35) return 0;
  return Math.round(ratio);
}

export function getWeekNumber(date: Date) {
  const temp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil(((temp.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}
