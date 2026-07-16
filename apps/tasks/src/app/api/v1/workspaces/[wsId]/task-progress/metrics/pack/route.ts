import { connection, type NextRequest, NextResponse } from 'next/server';
import {
  isTaskProgressSchemaUnavailableError,
  logTaskProgressError,
  parseTaskProgressJson,
  resolveTaskProgressRouteAuth,
  TASK_PROGRESS_METRIC_SELECT,
  type TaskProgressRouteContext,
  taskProgressRouteErrorResponse,
  taskProgressSchemaUnavailableResponse,
} from '../../_utils';

const METRIC_PACKS: Record<
  string,
  Array<{
    name: string;
    unit_label: string;
    unit_kind: string;
    description: string;
  }>
> = {
  writing: [
    {
      name: 'Words',
      unit_label: 'words',
      unit_kind: 'words',
      description: 'Writing word-count progress',
    },
    {
      name: 'Pages',
      unit_label: 'pages',
      unit_kind: 'pages',
      description: 'Writing page progress',
    },
    {
      name: 'Chapters',
      unit_label: 'chapters',
      unit_kind: 'chapters',
      description: 'Writing chapter progress',
    },
    {
      name: 'Scenes',
      unit_label: 'scenes',
      unit_kind: 'scenes',
      description: 'Writing scene progress',
    },
    {
      name: 'Lines',
      unit_label: 'lines',
      unit_kind: 'lines',
      description: 'Writing line progress',
    },
  ],
};

export async function POST(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  await connection();
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await parseTaskProgressJson(request).catch(() => ({}));
    const packKey =
      typeof (body as any)?.pack === 'string' ? (body as any).pack : 'writing';
    const pack = METRIC_PACKS[packKey];
    if (!pack) {
      return NextResponse.json(
        { ok: false, message: `Unknown metric pack: ${packKey}` },
        { status: 400 }
      );
    }

    // Only insert metrics whose (case-insensitive) name is not already present.
    const { data: existing, error: existingError } = await (auth.sbAdmin as any)
      .from('task_progress_metrics')
      .select('name')
      .eq('ws_id', auth.wsId)
      .is('archived_at', null);
    if (existingError) throw existingError;

    const existingNames = new Set(
      (existing ?? []).map((row: any) => String(row.name).trim().toLowerCase())
    );
    const toInsert = pack
      .filter((metric) => !existingNames.has(metric.name.toLowerCase()))
      .map((metric) => ({
        ws_id: auth.wsId,
        name: metric.name,
        unit_label: metric.unit_label,
        unit_kind: metric.unit_kind,
        description: metric.description,
        is_default: false,
        created_by: auth.user.id,
      }));

    if (toInsert.length > 0) {
      const { error: insertError } = await (auth.sbAdmin as any)
        .from('task_progress_metrics')
        .insert(toInsert);
      if (insertError) throw insertError;
    }

    const { data: metrics, error: listError } = await (auth.sbAdmin as any)
      .from('task_progress_metrics')
      .select(TASK_PROGRESS_METRIC_SELECT)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (listError) throw listError;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      pack: packKey,
      added: toInsert.length,
      metrics: metrics ?? [],
    });
  } catch (error) {
    if (isTaskProgressSchemaUnavailableError(error)) {
      return taskProgressSchemaUnavailableResponse({ metrics: [], added: 0 });
    }
    logTaskProgressError('Failed to apply metric pack', error);
    return taskProgressRouteErrorResponse(error, 'Failed to apply metric pack');
  }
}
