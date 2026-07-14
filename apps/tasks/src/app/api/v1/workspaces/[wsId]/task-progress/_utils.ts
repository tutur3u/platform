import { CLI_APP_TARGET_APP } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import {
  isAutonomousTaskMetric,
  loadAutonomousTaskProgressEntries,
} from './_autonomous';
import {
  DEFAULT_TASK_PROGRESS_METRICS,
  TASK_PROGRESS_ENTRY_SELECT,
} from './_schemas';

export * from './_schemas';

export type TaskProgressRouteContext = {
  params: Promise<{ wsId: string }>;
};

export type TaskProgressRouteAuth = {
  sbAdmin: TypedSupabaseClient;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
  wsId: string;
};

const TASK_PROGRESS_APP_SESSION_AUTH = {
  targetApp: [CLI_APP_TARGET_APP, 'tasks'],
} as const;

export function taskProgressSchemaUnavailableResponse(
  extra?: Record<string, unknown>
) {
  return NextResponse.json({
    ok: false,
    code: 'schema_unavailable',
    schemaAvailable: false,
    message:
      'Task progress is not available until the latest database migration is applied.',
    ...extra,
  });
}

export function taskProgressErrorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function isTaskProgressSchemaUnavailableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const candidate = error as {
    code?: string | null;
    details?: string | null;
    message?: string | null;
  };
  const code = candidate.code ?? '';
  const text = [candidate.message, candidate.details]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const mentionsTaskProgressSchema =
    text.includes('task_progress_') || text.includes('task_leaderboard');
  const looksLikeMissingSchema =
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('does not exist') ||
    text.includes('column') ||
    text.includes('relation');

  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    (mentionsTaskProgressSchema && looksLikeMissingSchema)
  );
}

export function taskProgressRouteErrorResponse(
  error: unknown,
  fallback: string
) {
  if (error instanceof z.ZodError) {
    return taskProgressErrorResponse(
      error.issues[0]?.message ?? 'Invalid request',
      400
    );
  }

  if (isTaskProgressSchemaUnavailableError(error)) {
    return taskProgressSchemaUnavailableResponse();
  }

  return taskProgressErrorResponse(fallback, 500);
}

export async function parseTaskProgressJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([
      {
        code: 'custom',
        message: 'Invalid JSON body',
        path: [],
        input: undefined,
      },
    ]);
  }
}

export async function resolveTaskProgressRouteAuth(
  request: NextRequest,
  context: TaskProgressRouteContext
): Promise<TaskProgressRouteAuth | NextResponse> {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: TASK_PROGRESS_APP_SESSION_AUTH,
  });
  if (!auth.ok) return auth.response;

  const { wsId: rawWsId } = await context.params;
  const wsId = await normalizeWorkspaceId(rawWsId, auth.supabase);
  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId: auth.user.id,
    supabase: auth.supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    return taskProgressErrorResponse(
      'Failed to verify workspace membership',
      500
    );
  }

  if (!memberCheck.ok) {
    return taskProgressErrorResponse('Workspace access denied', 403);
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  return { sbAdmin, supabase: auth.supabase, user: auth.user, wsId };
}

export async function ensureDefaultTaskProgressMetrics(
  auth: TaskProgressRouteAuth
) {
  const { data, error } = await (auth.sbAdmin as any)
    .from('task_progress_metrics')
    .select('name')
    .eq('ws_id', auth.wsId)
    .is('archived_at', null);

  if (error) throw error;
  const existingNames = new Set(
    (data ?? []).map((metric: { name: string }) =>
      metric.name.trim().toLowerCase()
    )
  );
  const missingMetrics = DEFAULT_TASK_PROGRESS_METRICS.filter(
    (metric) => !existingNames.has(metric.name.toLowerCase())
  );
  if (missingMetrics.length === 0) return;

  const { error: insertError } = await (auth.sbAdmin as any)
    .from('task_progress_metrics')
    .insert(
      missingMetrics.map((metric) => ({
        ...metric,
        aggregation: 'sum',
        ws_id: auth.wsId,
        created_by: auth.user.id,
      }))
    );

  if (insertError && insertError.code !== '23505') throw insertError;
}

export async function requireMetricInWorkspace(
  auth: TaskProgressRouteAuth,
  metricId?: string | null
) {
  if (!metricId) return { ok: true as const };

  const { data, error } = await (auth.sbAdmin as any)
    .from('task_progress_metrics')
    .select('id')
    .eq('id', metricId)
    .eq('ws_id', auth.wsId)
    .is('archived_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { error: taskProgressErrorResponse('Metric not found', 404) };
  }

  return { ok: true as const };
}

async function resourceExists(
  auth: TaskProgressRouteAuth,
  table: string,
  id: string,
  workspaceColumn = 'ws_id'
) {
  const { data, error } = await (auth.sbAdmin as any)
    .from(table)
    .select('id')
    .eq('id', id)
    .eq(workspaceColumn, auth.wsId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function listBelongsToWorkspace(
  auth: TaskProgressRouteAuth,
  listId: string
) {
  const { data: list, error: listError } = await (auth.sbAdmin as any)
    .from('task_lists')
    .select('id, board_id')
    .eq('id', listId)
    .maybeSingle();

  if (listError) throw listError;
  if (!list?.board_id) return false;

  return resourceExists(auth, 'workspace_boards', list.board_id, 'ws_id');
}

async function taskBelongsToWorkspace(
  auth: TaskProgressRouteAuth,
  taskId: string
) {
  const { data: task, error: taskError } = await (auth.sbAdmin as any)
    .from('tasks')
    .select('id, board_id, list_id')
    .eq('id', taskId)
    .maybeSingle();

  if (taskError) throw taskError;
  if (!task) return false;
  if (task.board_id) {
    return resourceExists(auth, 'workspace_boards', task.board_id, 'ws_id');
  }
  if (task.list_id) return listBelongsToWorkspace(auth, task.list_id);
  return false;
}

export async function validateTaskProgressScope(
  auth: TaskProgressRouteAuth,
  scope: {
    board_id?: string | null;
    list_id?: string | null;
    project_id?: string | null;
    task_id?: string | null;
  }
) {
  if (
    scope.board_id &&
    !(await resourceExists(auth, 'workspace_boards', scope.board_id, 'ws_id'))
  ) {
    return { error: taskProgressErrorResponse('Board not found', 404) };
  }

  if (
    scope.project_id &&
    !(await resourceExists(auth, 'task_projects', scope.project_id, 'ws_id'))
  ) {
    return { error: taskProgressErrorResponse('Project not found', 404) };
  }

  if (scope.list_id && !(await listBelongsToWorkspace(auth, scope.list_id))) {
    return { error: taskProgressErrorResponse('List not found', 404) };
  }

  if (scope.task_id && !(await taskBelongsToWorkspace(auth, scope.task_id))) {
    return { error: taskProgressErrorResponse('Task not found', 404) };
  }

  return { ok: true as const };
}

export function buildEntryQuery(auth: TaskProgressRouteAuth, url: URL) {
  let query = (auth.sbAdmin as any)
    .from('task_progress_entries')
    .select(`${TASK_PROGRESS_ENTRY_SELECT}, metric:task_progress_metrics(*)`)
    .eq('ws_id', auth.wsId)
    .is('deleted_at', null)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });

  for (const key of [
    'metric_id',
    'task_id',
    'project_id',
    'board_id',
    'list_id',
    'created_by',
  ]) {
    const value = url.searchParams.get(key);
    if (value) query = query.eq(key, value);
  }

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from) query = query.gte('entry_date', from);
  if (to) query = query.lte('entry_date', to);

  return query;
}

export function normalizeProgressValue(entry: {
  mode?: string | null;
  value?: number | string | null;
}) {
  const value = Number(entry.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

type EffectiveProgressEntry = {
  board_id?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  entry_date?: string | null;
  id?: string | null;
  list_id?: string | null;
  metric_id?: string | null;
  mode?: string | null;
  project_id?: string | null;
  tags?: unknown;
  task_id?: string | null;
  value?: number | string | null;
};

function totalModeScopeKey(entry: EffectiveProgressEntry) {
  return [
    entry.created_by ?? '',
    entry.metric_id ?? '',
    entry.task_id ?? '',
    entry.project_id ?? '',
    entry.board_id ?? '',
    entry.list_id ?? '',
  ].join(':');
}

function compareProgressEntries(
  a: EffectiveProgressEntry,
  b: EffectiveProgressEntry
) {
  const dateDelta = String(a.entry_date ?? '').localeCompare(
    String(b.entry_date ?? '')
  );
  if (dateDelta !== 0) return dateDelta;

  const createdAtDelta = String(a.created_at ?? '').localeCompare(
    String(b.created_at ?? '')
  );
  if (createdAtDelta !== 0) return createdAtDelta;

  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

export function withEffectiveProgressValues<T extends EffectiveProgressEntry>(
  entries: T[]
) {
  const previousTotals = new Map<string, number>();
  const effectiveValues = new Map<number, number>();

  entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => compareProgressEntries(a.entry, b.entry))
    .forEach(({ entry, index }) => {
      const rawValue = normalizeProgressValue(entry);

      if (entry.mode !== 'total') {
        effectiveValues.set(index, rawValue);
        return;
      }

      const scopeKey = totalModeScopeKey(entry);
      const previousTotal = previousTotals.get(scopeKey) ?? 0;
      previousTotals.set(scopeKey, rawValue);
      effectiveValues.set(index, rawValue - previousTotal);
    });

  return entries.map((entry, index) => ({
    ...entry,
    effectiveValue: effectiveValues.get(index) ?? normalizeProgressValue(entry),
  }));
}

export function entryMatchesGoal(
  entry: Record<string, any>,
  goal: Record<string, any>
) {
  if (goal.metric_id && entry.metric_id !== goal.metric_id) return false;
  if (goal.task_id && entry.task_id !== goal.task_id) return false;
  if (goal.project_id && entry.project_id !== goal.project_id) return false;
  if (goal.board_id && entry.board_id !== goal.board_id) return false;
  if (goal.period_start && entry.entry_date < goal.period_start) return false;
  if (goal.period_end && entry.entry_date > goal.period_end) return false;

  const goalTags = Array.isArray(goal.tags) ? goal.tags : [];
  if (goalTags.length > 0) {
    const entryTags = new Set(Array.isArray(entry.tags) ? entry.tags : []);
    return goalTags.every((tag) => entryTags.has(tag));
  }

  return true;
}

export async function hydrateGoalsWithProgress(
  auth: TaskProgressRouteAuth,
  goals: Record<string, any>[]
) {
  if (goals.length === 0) return goals;

  const metricIds = Array.from(new Set(goals.map((goal) => goal.metric_id)));
  const minStart = goals
    .map((goal) => goal.period_start)
    .filter(Boolean)
    .sort()[0];
  const maxEnd = goals
    .map((goal) => goal.period_end)
    .filter(Boolean)
    .sort()
    .at(-1);

  let query = (auth.sbAdmin as any)
    .from('task_progress_entries')
    .select(TASK_PROGRESS_ENTRY_SELECT)
    .eq('ws_id', auth.wsId)
    .is('deleted_at', null)
    .in('metric_id', metricIds);

  if (minStart) query = query.gte('entry_date', minStart);
  if (maxEnd) query = query.lte('entry_date', maxEnd);

  const { data: entries, error } = await query;
  if (error) throw error;

  const effectiveEntries = withEffectiveProgressValues(entries ?? []);

  return Promise.all(
    goals.map(async (goal) => {
      const metric = goal.metric;
      const entriesForGoal =
        metric && isAutonomousTaskMetric(metric)
          ? await loadAutonomousTaskProgressEntries(auth, metric, {
              from: goal.period_start,
              to: goal.period_end,
            })
          : effectiveEntries;
      const progress = entriesForGoal
        .filter((entry: Record<string, any>) => entryMatchesGoal(entry, goal))
        .reduce(
          (total: number, entry: Record<string, any>) =>
            total + Number(entry.effectiveValue ?? 0),
          0
        );
      const target = Number(goal.target_value ?? 0);

      return {
        ...goal,
        progress,
        remaining: Math.max(target - progress, 0),
        percent: target > 0 ? Math.min((progress / target) * 100, 100) : 0,
      };
    })
  );
}

export function logTaskProgressError(message: string, error: unknown) {
  if (!isTaskProgressSchemaUnavailableError(error)) {
    console.error(message, { error });
  }
}
