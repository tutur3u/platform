import { type NextRequest, NextResponse } from 'next/server';
import {
  buildEntryQuery,
  entryCreateSchema,
  isTaskProgressSchemaUnavailableError,
  logTaskProgressError,
  parseTaskProgressJson,
  requireMetricInWorkspace,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_ENTRY_SELECT,
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
    const pageSize = Math.min(
      Math.max(Number(url.searchParams.get('pageSize') ?? 50), 1),
      200
    );
    const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await buildEntryQuery(auth, url).range(
      from,
      to
    );

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      entries: data ?? [],
      count: count ?? null,
      page,
      pageSize,
    });
  } catch (error) {
    if (isTaskProgressSchemaUnavailableError(error)) {
      return taskProgressSchemaUnavailableResponse({ entries: [] });
    }

    logTaskProgressError('Failed to list task progress entries', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to list task progress entries'
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
    const body = entryCreateSchema.parse(await parseTaskProgressJson(request));
    const metricCheck = await requireMetricInWorkspace(auth, body.metric_id);
    if ('error' in metricCheck) return metricCheck.error;

    const scopeCheck = await validateTaskProgressScope(auth, body);
    if ('error' in scopeCheck) return scopeCheck.error;

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_entries')
      .insert({
        ...body,
        ws_id: auth.wsId,
        created_by: auth.user.id,
      })
      .select(`${TASK_PROGRESS_ENTRY_SELECT}, metric:task_progress_metrics(*)`)
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      entry: data,
    });
  } catch (error) {
    logTaskProgressError('Failed to create task progress entry', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to create task progress entry'
    );
  }
}
