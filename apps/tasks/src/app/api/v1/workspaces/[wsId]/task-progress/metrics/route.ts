import { connection, type NextRequest, NextResponse } from 'next/server';
import {
  ensureDefaultTaskProgressMetrics,
  isTaskProgressSchemaUnavailableError,
  logTaskProgressError,
  metricCreateSchema,
  parseTaskProgressJson,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_METRIC_SELECT,
  type TaskProgressRouteContext,
  taskProgressRouteErrorResponse,
  taskProgressSchemaUnavailableResponse,
} from '../_utils';

export async function GET(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  await connection();
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDefaultTaskProgressMetrics(auth);

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_metrics')
      .select(TASK_PROGRESS_METRIC_SELECT)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      metrics: data ?? [],
    });
  } catch (error) {
    if (isTaskProgressSchemaUnavailableError(error)) {
      return taskProgressSchemaUnavailableResponse({ metrics: [] });
    }

    logTaskProgressError('Failed to list task progress metrics', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to list task progress metrics'
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
    const body = metricCreateSchema.parse(await parseTaskProgressJson(request));

    if (body.is_default) {
      const { error: defaultError } = await (auth.sbAdmin as any)
        .from('task_progress_metrics')
        .update({ is_default: false })
        .eq('ws_id', auth.wsId)
        .is('archived_at', null);

      if (defaultError) throw defaultError;
    }

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_metrics')
      .insert({
        ...body,
        ws_id: auth.wsId,
        created_by: auth.user.id,
      })
      .select(TASK_PROGRESS_METRIC_SELECT)
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      metric: data,
    });
  } catch (error) {
    logTaskProgressError('Failed to create task progress metric', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to create task progress metric'
    );
  }
}
