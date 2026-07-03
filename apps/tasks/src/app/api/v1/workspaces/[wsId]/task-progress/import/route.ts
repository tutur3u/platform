import { type NextRequest, NextResponse } from 'next/server';
import {
  logTaskProgressError,
  parseTaskProgressJson,
  progressImportSchema,
  requireMetricInWorkspace,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_ENTRY_SELECT,
  type TaskProgressRouteContext,
  taskProgressRouteErrorResponse,
  validateTaskProgressScope,
} from '../_utils';

export async function POST(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = progressImportSchema.parse(
      await parseTaskProgressJson(request)
    );
    const normalizedEntries = [];

    for (const [index, entry] of body.entries.entries()) {
      const metricCheck = await requireMetricInWorkspace(auth, entry.metric_id);
      if ('error' in metricCheck) return metricCheck.error;

      const scopeCheck = await validateTaskProgressScope(auth, entry);
      if ('error' in scopeCheck) return scopeCheck.error;

      normalizedEntries.push({
        ...entry,
        ws_id: auth.wsId,
        created_by: auth.user.id,
        source_type: 'import',
        source_id: entry.source_id ?? `import:${index + 1}`,
      });
    }

    const total = normalizedEntries.reduce(
      (sum, entry) => sum + Number(entry.value ?? 0),
      0
    );

    if (!body.commit) {
      return NextResponse.json({
        ok: true,
        schemaAvailable: true,
        committed: false,
        entries: normalizedEntries,
        summary: {
          entriesCount: normalizedEntries.length,
          total,
        },
      });
    }

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_progress_entries')
      .insert(normalizedEntries)
      .select(`${TASK_PROGRESS_ENTRY_SELECT}, metric:task_progress_metrics(*)`);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      committed: true,
      entries: data ?? [],
      summary: {
        entriesCount: data?.length ?? 0,
        total,
      },
    });
  } catch (error) {
    logTaskProgressError('Failed to import task progress entries', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to import task progress entries'
    );
  }
}
