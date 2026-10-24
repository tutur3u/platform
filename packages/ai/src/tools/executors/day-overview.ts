import {
  listWorkspaceHabitTrackerEntries,
  listWorkspaceHabitTrackers,
} from '@tuturuuu/internal-api/habit-trackers';
import type {
  HabitTracker,
  HabitTrackerEntry,
} from '@tuturuuu/types/primitives/HabitTracker';
import { Effect } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import type { MiraToolContext } from '../mira-tool-types';
import { getWorkspaceContextWorkspaceId } from '../workspace-context';
import {
  aggregateDayValue,
  ENTRY_PAGE_LIMIT,
  errorMessage,
  formatInTimezone,
  getDayWindow,
  getTrackerUnit,
  isTargetMet,
  isValidDateKey,
  resolveHabitApi,
  resolveUserTimezone,
  toDateKey,
} from './habit-helpers';
import { decryptEventsForTools } from './helpers/encryption';
import { executeGetMyTasks } from './tasks';

export const DAY_OVERVIEW_LIMITS = {
  tasks: 15,
  events: 20,
  habitTrackers: 10,
} as const;

const argsSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

type DayContext = {
  ctx: MiraToolContext;
  wsId: string;
  dateKey: string;
  timezone: string;
  start: Date;
  end: Date;
};

type TaskFeedTask = {
  id: string;
  name: string;
  priority?: string | null;
  dueDate?: string | null;
  boardName?: string;
  listName?: string;
};
type TaskFeedGroup = { count?: number; hasMore?: boolean; tasks?: unknown[] };

function failure(result: unknown) {
  if (!result || typeof result !== 'object') return 'Tasks are unavailable.';
  if ('error' in result && result.error) return String(result.error);
  return null;
}

/** Reuses get_my_tasks, then re-buckets due dates against the user's day. */
async function loadTasks({ ctx, timezone, start, end }: DayContext) {
  const result = (await executeGetMyTasks({ category: 'all' }, ctx)) as Record<
    string,
    TaskFeedGroup | unknown
  >;
  const error = failure(result);
  if (error) throw new Error(error);
  const seen = new Set<string>();
  const dueOnDay: TaskFeedTask[] = [];
  const overdue: TaskFeedTask[] = [];
  let mayBeIncomplete = false;
  for (const key of ['overdue', 'today', 'upcoming']) {
    const group = result[key] as TaskFeedGroup | undefined;
    const tasks = (group?.tasks ?? []) as TaskFeedTask[];
    if (group?.hasMore || (group?.count ?? 0) > tasks.length)
      mayBeIncomplete = true;
    for (const task of tasks) {
      if (!task?.id || seen.has(task.id) || !task.dueDate) continue;
      seen.add(task.id);
      const due = Date.parse(task.dueDate);
      if (Number.isNaN(due) || due >= end.getTime()) continue;
      (due < start.getTime() ? overdue : dueOnDay).push(task);
    }
  }
  const byDue = (a: TaskFeedTask, b: TaskFeedTask) =>
    Date.parse(a.dueDate!) - Date.parse(b.dueDate!);
  dueOnDay.sort(byDue);
  overdue.sort(byDue);
  const shownDue = dueOnDay.slice(0, DAY_OVERVIEW_LIMITS.tasks);
  const shownOverdue = overdue.slice(
    0,
    DAY_OVERVIEW_LIMITS.tasks - shownDue.length
  );
  const format = (task: TaskFeedTask) => ({
    id: task.id,
    name: task.name,
    priority: task.priority ?? null,
    dueDate: formatInTimezone(task.dueDate!, timezone),
    ...(task.boardName ? { boardName: task.boardName } : {}),
    ...(task.listName ? { listName: task.listName } : {}),
  });
  return {
    dueOnDay: shownDue.map(format),
    overdue: shownOverdue.map(format),
    counts: { dueOnDay: dueOnDay.length, overdue: overdue.length },
    truncated:
      dueOnDay.length + overdue.length > shownDue.length + shownOverdue.length,
    ...(mayBeIncomplete ? { mayBeIncomplete: true } : {}),
  };
}

async function loadCalendar({ ctx, wsId, timezone, start, end }: DayContext) {
  // Calendar reads require manage_calendar, like get_upcoming_events.
  if (!ctx.authorizeWorkspaceTools)
    throw new Error('Calendar access could not be verified in this session.');
  if (!(await ctx.authorizeWorkspaceTools(wsId, ['manage_calendar'])))
    throw new Error('The current workspace does not grant calendar access.');
  const { data, error } = await ctx.supabase
    .from('workspace_calendar_events')
    .select('id, title, start_at, end_at, location, is_encrypted, locked')
    .eq('ws_id', wsId)
    .lt('start_at', end.toISOString())
    .gt('end_at', start.toISOString())
    .order('start_at', { ascending: true })
    .limit(DAY_OVERVIEW_LIMITS.events + 1);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const events = await decryptEventsForTools(
    rows.slice(0, DAY_OVERVIEW_LIMITS.events),
    wsId
  );
  return {
    count: events.length,
    truncated: rows.length > DAY_OVERVIEW_LIMITS.events,
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      start: formatInTimezone(event.start_at, timezone),
      end: formatInTimezone(event.end_at, timezone),
      location: event.location ?? null,
      locked: event.locked === true,
    })),
  };
}

/** Aggregates where hidden entries can only raise the total. */
const MONOTONIC_STRATEGIES = new Set(['max', 'count_entries', 'boolean_any']);

/**
 * The Tasks entry list holds only the most recent entries across all members.
 * When it is full, entries for the day may be missing, so progress is reported
 * as incomplete rather than a false zero.
 */
export function summarizeDayProgress(
  tracker: HabitTracker,
  entries: Array<
    Pick<
      HabitTrackerEntry,
      'user_id' | 'entry_date' | 'primary_value' | 'values'
    >
  >,
  userId: string,
  dateKey: string
) {
  const mine = entries.filter(
    (entry) => entry.user_id === userId && entry.entry_date === dateKey
  );
  const total = aggregateDayValue(tracker, mine);
  const daily = tracker.target_period === 'daily';
  if (entries.length < ENTRY_PAGE_LIMIT)
    return {
      progress: 'complete' as const,
      dayTotal: total,
      entryCount: mine.length,
      ...(daily ? { met: isTargetMet(tracker, total) } : {}),
    };
  const provablyMet =
    tracker.target_operator === 'gte' &&
    MONOTONIC_STRATEGIES.has(tracker.aggregation_strategy) &&
    total >= tracker.target_value;
  return {
    progress: 'incomplete' as const,
    dayTotal: null,
    visibleTotal: total,
    visibleEntryCount: mine.length,
    ...(daily ? { met: provablyMet ? true : null } : {}),
  };
}

async function loadHabits({ ctx, wsId, dateKey }: DayContext) {
  const api = resolveHabitApi(ctx);
  if (!api.ok) throw new Error(api.result.error);
  const { trackers } = await listWorkspaceHabitTrackers(
    wsId,
    { scope: 'self' },
    api.options
  );
  const active = trackers
    .map((card) => card.tracker)
    .filter((tracker) => tracker.is_active !== false && !tracker.archived_at);
  const shown = active.slice(0, DAY_OVERVIEW_LIMITS.habitTrackers);
  const items = await Effect.runPromise(
    Effect.forEach(
      shown,
      (tracker) =>
        Effect.tryPromise(
          (): Promise<HabitTrackerEntry[]> =>
            listWorkspaceHabitTrackerEntries(wsId, tracker.id, api.options)
        ).pipe(
          Effect.map((entries) => ({
            id: tracker.id,
            name: tracker.name,
            useCase: tracker.use_case ?? 'generic',
            unit: getTrackerUnit(tracker),
            targetPeriod: tracker.target_period,
            target: tracker.target_value,
            ...summarizeDayProgress(tracker, entries, ctx.userId, dateKey),
          })),
          Effect.catchAll(() =>
            Effect.succeed({
              id: tracker.id,
              name: tracker.name,
              error: 'Progress unavailable for this tracker.',
            })
          )
        ),
      { concurrency: 5 }
    )
  );
  return {
    count: active.length,
    truncated: active.length > shown.length,
    trackers: items,
  };
}

async function loadTimer({ ctx, wsId, timezone }: DayContext) {
  const { data, error } = await ctx.supabase
    .from('time_tracking_sessions')
    .select('id, title, start_time')
    .eq('user_id', ctx.userId)
    .eq('ws_id', wsId)
    .eq('is_running', true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { running: null };
  const startedAt = new Date(data.start_time);
  return {
    running: {
      id: data.id,
      title: data.title,
      startedAt: formatInTimezone(startedAt, timezone),
      elapsedMinutes: Math.max(
        0,
        Math.floor((Date.now() - startedAt.getTime()) / 60_000)
      ),
    },
  };
}

const sections = {
  tasks: loadTasks,
  calendar: loadCalendar,
  habits: loadHabits,
  timer: loadTimer,
} as const;

type SectionName = keyof typeof sections;

export async function executeGetDayOverview(
  args: Record<string, unknown>,
  ctx: MiraToolContext
) {
  const parsed = argsSchema.safeParse(args);
  if (
    !parsed.success ||
    (parsed.data.date && !isValidDateKey(parsed.data.date))
  )
    return { success: false, error: 'date must be a valid YYYY-MM-DD.' };
  const { timezone, timezoneAssumed } = resolveUserTimezone(ctx);
  const dateKey = parsed.data.date ?? toDateKey(new Date(), timezone);
  const { start, end } = getDayWindow(dateKey, timezone);
  const day: DayContext = {
    ctx,
    wsId: getWorkspaceContextWorkspaceId(ctx),
    dateKey,
    timezone,
    start,
    end,
  };
  const names = Object.keys(sections) as SectionName[];
  const results = await Effect.runPromise(
    Effect.forEach(
      names,
      (name) =>
        Effect.tryPromise({
          try: (): Promise<unknown> => sections[name](day),
          catch: (error: unknown) =>
            errorMessage(error, `${name} is unavailable.`),
        }).pipe(
          Effect.map((data) => ({ ok: true as const, data })),
          Effect.catchAll((error) =>
            Effect.succeed({ ok: false as const, error })
          )
        ),
      { concurrency: 'unbounded' }
    )
  );
  const output: Record<string, unknown> = {};
  const errors: Partial<Record<SectionName, string>> = {};
  names.forEach((name, index) => {
    const result = results[index]!;
    if (result.ok) output[name] = result.data;
    else {
      output[name] = null;
      errors[name] = result.error;
    }
  });
  const failed = Object.keys(errors).length;
  return {
    success: failed < names.length,
    date: dateKey,
    timezone,
    ...(timezoneAssumed ? { timezoneAssumed: true } : {}),
    window: { start: start.toISOString(), end: end.toISOString() },
    ...output,
    ...(failed ? { errors, partial: failed < names.length } : {}),
  };
}
