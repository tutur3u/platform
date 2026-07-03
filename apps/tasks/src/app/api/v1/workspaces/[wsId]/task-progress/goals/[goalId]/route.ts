import { type NextRequest, NextResponse } from 'next/server';
import {
  goalUpdateSchema,
  hydrateGoalsWithProgress,
  logTaskProgressError,
  parseTaskProgressJson,
  requireMetricInWorkspace,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_GOAL_SELECT,
  taskProgressErrorResponse,
  taskProgressRouteErrorResponse,
  validateTaskProgressScope,
} from '../../_utils';

type GoalRouteContext = {
  params: Promise<{ wsId: string; goalId: string }>;
};

export async function PATCH(request: NextRequest, context: GoalRouteContext) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { goalId } = await context.params;
    const body = goalUpdateSchema.parse(await parseTaskProgressJson(request));

    if (body.metric_id) {
      const metricCheck = await requireMetricInWorkspace(auth, body.metric_id);
      if ('error' in metricCheck) return metricCheck.error;
    }

    const scopeCheck = await validateTaskProgressScope(auth, body);
    if ('error' in scopeCheck) return scopeCheck.error;

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_goals')
      .update(body)
      .eq('id', goalId)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .select(`${TASK_PROGRESS_GOAL_SELECT}, metric:task_progress_metrics(*)`)
      .maybeSingle();

    if (error) throw error;
    if (!data) return taskProgressErrorResponse('Goal not found', 404);

    const [goal] = await hydrateGoalsWithProgress(auth, [data]);
    return NextResponse.json({ ok: true, schemaAvailable: true, goal });
  } catch (error) {
    logTaskProgressError('Failed to update task progress goal', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to update task progress goal'
    );
  }
}

export async function DELETE(request: NextRequest, context: GoalRouteContext) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { goalId } = await context.params;
    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_goals')
      .update({ archived_at: new Date().toISOString(), status: 'archived' })
      .eq('id', goalId)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return taskProgressErrorResponse('Goal not found', 404);

    return NextResponse.json({ ok: true, schemaAvailable: true });
  } catch (error) {
    logTaskProgressError('Failed to archive task progress goal', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to archive task progress goal'
    );
  }
}
