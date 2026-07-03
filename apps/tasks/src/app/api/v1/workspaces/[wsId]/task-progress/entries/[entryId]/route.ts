import { type NextRequest, NextResponse } from 'next/server';
import {
  entryUpdateSchema,
  logTaskProgressError,
  parseTaskProgressJson,
  requireMetricInWorkspace,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_ENTRY_SELECT,
  taskProgressErrorResponse,
  taskProgressRouteErrorResponse,
  validateTaskProgressScope,
} from '../../_utils';

type EntryRouteContext = {
  params: Promise<{ wsId: string; entryId: string }>;
};

export async function PATCH(request: NextRequest, context: EntryRouteContext) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { entryId } = await context.params;
    const body = entryUpdateSchema.parse(await parseTaskProgressJson(request));

    if (body.metric_id) {
      const metricCheck = await requireMetricInWorkspace(auth, body.metric_id);
      if ('error' in metricCheck) return metricCheck.error;
    }

    const scopeCheck = await validateTaskProgressScope(auth, body);
    if ('error' in scopeCheck) return scopeCheck.error;

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_entries')
      .update(body)
      .eq('id', entryId)
      .eq('ws_id', auth.wsId)
      .is('deleted_at', null)
      .select(`${TASK_PROGRESS_ENTRY_SELECT}, metric:task_progress_metrics(*)`)
      .maybeSingle();

    if (error) throw error;
    if (!data)
      return taskProgressErrorResponse('Progress entry not found', 404);

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      entry: data,
    });
  } catch (error) {
    logTaskProgressError('Failed to update task progress entry', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to update task progress entry'
    );
  }
}

export async function DELETE(request: NextRequest, context: EntryRouteContext) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { entryId } = await context.params;
    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', entryId)
      .eq('ws_id', auth.wsId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data)
      return taskProgressErrorResponse('Progress entry not found', 404);

    return NextResponse.json({ ok: true, schemaAvailable: true });
  } catch (error) {
    logTaskProgressError('Failed to delete task progress entry', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to delete task progress entry'
    );
  }
}
