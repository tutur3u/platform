import { type NextRequest, NextResponse } from 'next/server';
import {
  leaderboardUpdateSchema,
  logTaskProgressError,
  parseTaskProgressJson,
  requireMetricInWorkspace,
  resolveTaskProgressRouteAuth,
  TASK_LEADERBOARD_SELECT,
  taskProgressErrorResponse,
  taskProgressRouteErrorResponse,
} from '../../_utils';
import { hydrateLeaderboards } from '../_leaderboards';

type LeaderboardRouteContext = {
  params: Promise<{ wsId: string; leaderboardId: string }>;
};

export async function GET(
  request: NextRequest,
  context: LeaderboardRouteContext
) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { leaderboardId } = await context.params;
    const { data, error } = await (auth.sbAdmin as any)
      .from('task_leaderboards')
      .select(`${TASK_LEADERBOARD_SELECT}, metric:task_progress_metrics(*)`)
      .eq('id', leaderboardId)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!data) return taskProgressErrorResponse('Leaderboard not found', 404);

    const [leaderboard] = await hydrateLeaderboards(auth, [data]);
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      leaderboard,
    });
  } catch (error) {
    logTaskProgressError('Failed to load task leaderboard', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to load task leaderboard'
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: LeaderboardRouteContext
) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { leaderboardId } = await context.params;
    const body = leaderboardUpdateSchema.parse(
      await parseTaskProgressJson(request)
    );

    if (body.metric_id) {
      const metricCheck = await requireMetricInWorkspace(auth, body.metric_id);
      if ('error' in metricCheck) return metricCheck.error;
    }

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_leaderboards')
      .update(body)
      .eq('id', leaderboardId)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .select(`${TASK_LEADERBOARD_SELECT}, metric:task_progress_metrics(*)`)
      .maybeSingle();

    if (error) throw error;
    if (!data) return taskProgressErrorResponse('Leaderboard not found', 404);

    const [leaderboard] = await hydrateLeaderboards(auth, [data]);
    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      leaderboard,
    });
  } catch (error) {
    logTaskProgressError('Failed to update task leaderboard', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to update task leaderboard'
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: LeaderboardRouteContext
) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { leaderboardId } = await context.params;
    const { data, error } = await (auth.sbAdmin as any)
      .from('task_leaderboards')
      .update({ archived_at: new Date().toISOString(), status: 'archived' })
      .eq('id', leaderboardId)
      .eq('ws_id', auth.wsId)
      .is('archived_at', null)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return taskProgressErrorResponse('Leaderboard not found', 404);

    return NextResponse.json({ ok: true, schemaAvailable: true });
  } catch (error) {
    logTaskProgressError('Failed to archive task leaderboard', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to archive task leaderboard'
    );
  }
}
