import { type NextRequest, NextResponse } from 'next/server';
import {
  goalCreateSchema,
  hydrateGoalsWithProgress,
  isTaskProgressSchemaUnavailableError,
  logTaskProgressError,
  parseTaskProgressJson,
  requireMetricInWorkspace,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_GOAL_SELECT,
  type TaskProgressRouteContext,
  taskProgressRouteErrorResponse,
  taskProgressSchemaUnavailableResponse,
  validateTaskProgressScope,
} from '../_utils';

export async function GET(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(request.url);
    let query = (auth.sbAdmin as any)
      .from('task_progress_goals')
      .select(`${TASK_PROGRESS_GOAL_SELECT}, metric:task_progress_metrics(*)`)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .order('starred', { ascending: false })
      .order('period_start', { ascending: false });

    const status = url.searchParams.get('status');
    const metricId = url.searchParams.get('metric_id');
    if (status) query = query.eq('status', status);
    if (metricId) query = query.eq('metric_id', metricId);

    const { data, error } = await query;
    if (error) throw error;

    const goals = await hydrateGoalsWithProgress(auth, data ?? []);
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      goals,
    });
  } catch (error) {
    if (isTaskProgressSchemaUnavailableError(error)) {
      return taskProgressSchemaUnavailableResponse({ goals: [] });
    }

    logTaskProgressError('Failed to list task progress goals', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to list task progress goals'
    );
  }
}

export async function POST(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = goalCreateSchema.parse(await parseTaskProgressJson(request));
    const metricCheck = await requireMetricInWorkspace(auth, body.metric_id);
    if ('error' in metricCheck) return metricCheck.error;

    const scopeCheck = await validateTaskProgressScope(auth, body);
    if ('error' in scopeCheck) return scopeCheck.error;

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_goals')
      .insert({
        ...body,
        ws_id: auth.wsId,
        owner_id: auth.user.id,
      })
      .select(`${TASK_PROGRESS_GOAL_SELECT}, metric:task_progress_metrics(*)`)
      .single();

    if (error) throw error;

    const [goal] = await hydrateGoalsWithProgress(auth, [data]);
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      goal,
    });
  } catch (error) {
    logTaskProgressError('Failed to create task progress goal', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to create task progress goal'
    );
  }
}
