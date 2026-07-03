import { type NextRequest, NextResponse } from 'next/server';
import {
  isTaskProgressSchemaUnavailableError,
  leaderboardCreateSchema,
  logTaskProgressError,
  parseTaskProgressJson,
  requireMetricInWorkspace,
  resolveTaskProgressRouteAuth,
  TASK_LEADERBOARD_SELECT,
  type TaskProgressRouteContext,
  taskProgressRouteErrorResponse,
  taskProgressSchemaUnavailableResponse,
} from '../_utils';
import { hydrateLeaderboards } from './_leaderboards';

export async function GET(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(request.url);
    let query = (auth.sbAdmin as any)
      .from('task_leaderboards')
      .select(`${TASK_LEADERBOARD_SELECT}, metric:task_progress_metrics(*)`)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .order('starred', { ascending: false })
      .order('period_start', { ascending: false });

    const status = url.searchParams.get('status');
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    const leaderboards = await hydrateLeaderboards(auth, data ?? []);
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      leaderboards,
    });
  } catch (error) {
    if (isTaskProgressSchemaUnavailableError(error)) {
      return taskProgressSchemaUnavailableResponse({ leaderboards: [] });
    }

    logTaskProgressError('Failed to list task leaderboards', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to list task leaderboards'
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
    const body = leaderboardCreateSchema.parse(
      await parseTaskProgressJson(request)
    );
    const metricCheck = await requireMetricInWorkspace(auth, body.metric_id);
    if ('error' in metricCheck) return metricCheck.error;

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_leaderboards')
      .insert({
        ...body,
        ws_id: auth.wsId,
        created_by: auth.user.id,
      })
      .select(`${TASK_LEADERBOARD_SELECT}, metric:task_progress_metrics(*)`)
      .single();

    if (error) throw error;

    const { error: memberError } = await (auth.sbAdmin as any)
      .from('task_leaderboard_members')
      .insert({
        leaderboard_id: data.id,
        user_id: auth.user.id,
        joined_by: auth.user.id,
      });

    if (memberError) throw memberError;

    const [leaderboard] = await hydrateLeaderboards(auth, [data]);
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      leaderboard,
    });
  } catch (error) {
    logTaskProgressError('Failed to create task leaderboard', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to create task leaderboard'
    );
  }
}
