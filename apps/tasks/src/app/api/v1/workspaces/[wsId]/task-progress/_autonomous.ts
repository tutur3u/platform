import type { TaskProgressMetric } from '@tuturuuu/tasks-api';
import type { TaskProgressRouteAuth } from './_utils';

export type TaskProgressEntryLike = {
  board_id?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  effectiveValue: number;
  entry_date: string;
  id: string;
  list_id?: string | null;
  metric_id: string;
  mode: 'delta';
  project_id?: string | null;
  source_type: 'task_completion' | 'time_tracking';
  tags: string[];
  task_id?: string | null;
  value: number;
};

export type TaskProgressDateRange = {
  from?: string | null;
  to?: string | null;
};

export function isAutonomousTaskMetric(metric: TaskProgressMetric) {
  return ['focus_sessions', 'minutes', 'points', 'tasks'].includes(
    metric.unit_kind
  );
}

function dateBoundary(date: string, endOfDay = false) {
  return `${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

function relationRecord(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value && typeof value === 'object'
    ? (value as Record<string, any>)
    : null;
}

export function taskCompletionRowsToEntries(
  rows: Record<string, any>[],
  metric: TaskProgressMetric
): TaskProgressEntryLike[] {
  return rows.flatMap((history) => {
    const task = relationRecord(history.task);
    const value =
      metric.unit_kind === 'points' ? Number(task?.estimation_points ?? 0) : 1;
    if (!Number.isFinite(value) || value <= 0) return [];

    const entryDate = String(history.changed_at ?? '').slice(0, 10);
    if (!entryDate) return [];

    return [
      {
        board_id: task?.board_id ?? history.metadata?.board_id ?? null,
        created_at: history.changed_at,
        created_by: history.changed_by,
        effectiveValue: value,
        entry_date: entryDate,
        id: `task-completion:${history.id}`,
        list_id: task?.list_id ?? null,
        metric_id: metric.id,
        mode: 'delta' as const,
        project_id: null,
        source_type: 'task_completion' as const,
        tags: ['automatic', 'task'],
        task_id: history.task_id,
        value,
      },
    ];
  });
}

export function focusSessionRowsToEntries(
  rows: Record<string, any>[],
  metric: TaskProgressMetric
): TaskProgressEntryLike[] {
  return rows.flatMap((session) => {
    const value =
      metric.unit_kind === 'focus_sessions'
        ? 1
        : Math.round((Number(session.duration_seconds ?? 0) / 60) * 100) / 100;
    if (!Number.isFinite(value) || value <= 0) return [];

    const entryDate = String(session.date ?? session.start_time ?? '').slice(
      0,
      10
    );
    if (!entryDate) return [];

    return [
      {
        board_id: null,
        created_at: session.created_at ?? session.start_time,
        created_by: session.user_id,
        effectiveValue: value,
        entry_date: entryDate,
        id: `focus-session:${session.id}`,
        list_id: null,
        metric_id: metric.id,
        mode: 'delta' as const,
        project_id: null,
        source_type: 'time_tracking' as const,
        tags: ['automatic', 'focus', ...(session.tags ?? [])],
        task_id: session.task_id,
        value,
      },
    ];
  });
}

async function loadTaskCompletionEntries(
  auth: TaskProgressRouteAuth,
  metric: TaskProgressMetric,
  range: TaskProgressDateRange
): Promise<TaskProgressEntryLike[]> {
  let query = (auth.sbAdmin as any)
    .from('task_history')
    .select(
      'id, task_id, changed_by, changed_at, metadata, task:tasks(estimation_points, list_id, board_id)'
    )
    .eq('field_name', 'completed')
    .eq('new_value', true)
    .contains('metadata', { ws_id: auth.wsId })
    .is('deleted_at', null)
    .order('changed_at', { ascending: false })
    .limit(5000);

  if (range.from) query = query.gte('changed_at', dateBoundary(range.from));
  if (range.to) query = query.lte('changed_at', dateBoundary(range.to, true));

  const { data, error } = await query;
  if (error) throw error;

  return taskCompletionRowsToEntries(data ?? [], metric);
}

async function loadFocusEntries(
  auth: TaskProgressRouteAuth,
  metric: TaskProgressMetric,
  range: TaskProgressDateRange
): Promise<TaskProgressEntryLike[]> {
  let query = (auth.sbAdmin as any)
    .from('time_tracking_sessions')
    .select(
      'id, task_id, user_id, date, start_time, duration_seconds, tags, created_at'
    )
    .eq('ws_id', auth.wsId)
    .eq('pending_approval', false)
    .not('duration_seconds', 'is', null)
    .gt('duration_seconds', 0)
    .order('start_time', { ascending: false })
    .limit(5000);

  if (range.from) query = query.gte('start_time', dateBoundary(range.from));
  if (range.to) query = query.lte('start_time', dateBoundary(range.to, true));

  const { data, error } = await query;
  if (error) throw error;

  return focusSessionRowsToEntries(data ?? [], metric);
}

export async function loadAutonomousTaskProgressEntries(
  auth: TaskProgressRouteAuth,
  metric: TaskProgressMetric,
  range: TaskProgressDateRange = {}
) {
  if (metric.unit_kind === 'tasks' || metric.unit_kind === 'points') {
    return loadTaskCompletionEntries(auth, metric, range);
  }

  if (metric.unit_kind === 'minutes' || metric.unit_kind === 'focus_sessions') {
    return loadFocusEntries(auth, metric, range);
  }

  return [];
}
