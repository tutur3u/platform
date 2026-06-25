import { type NextRequest, NextResponse } from 'next/server';
import {
  logTaskProgressError,
  metricUpdateSchema,
  parseTaskProgressJson,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_METRIC_SELECT,
  taskProgressErrorResponse,
  taskProgressRouteErrorResponse,
} from '../../_utils';

type MetricRouteContext = {
  params: Promise<{ wsId: string; metricId: string }>;
};

export async function PATCH(request: NextRequest, context: MetricRouteContext) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { metricId } = await context.params;
    const body = metricUpdateSchema.parse(await parseTaskProgressJson(request));

    if (body.is_default) {
      const { error: defaultError } = await (auth.sbAdmin as any)
        .from('task_progress_metrics')
        .update({ is_default: false })
        .eq('ws_id', auth.wsId)
        .neq('id', metricId)
        .is('archived_at', null);

      if (defaultError) throw defaultError;
    }

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_metrics')
      .update(body)
      .eq('id', metricId)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .select(TASK_PROGRESS_METRIC_SELECT)
      .maybeSingle();

    if (error) throw error;
    if (!data) return taskProgressErrorResponse('Metric not found', 404);

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      metric: data,
    });
  } catch (error) {
    logTaskProgressError('Failed to update task progress metric', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to update task progress metric'
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: MetricRouteContext
) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { metricId } = await context.params;
    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_metrics')
      .update({ archived_at: new Date().toISOString(), is_default: false })
      .eq('id', metricId)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return taskProgressErrorResponse('Metric not found', 404);

    return NextResponse.json({ ok: true, schemaAvailable: true });
  } catch (error) {
    logTaskProgressError('Failed to archive task progress metric', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to archive task progress metric'
    );
  }
}
