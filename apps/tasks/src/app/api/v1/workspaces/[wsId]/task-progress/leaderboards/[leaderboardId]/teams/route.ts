import { type NextRequest, NextResponse } from 'next/server';
import {
  leaderboardTeamCreateSchema,
  logTaskProgressError,
  parseTaskProgressJson,
  resolveTaskProgressRouteAuth,
  taskProgressErrorResponse,
  taskProgressRouteErrorResponse,
} from '../../../_utils';

type TeamsRouteContext = {
  params: Promise<{ wsId: string; leaderboardId: string }>;
};

async function requireLeaderboard(auth: any, leaderboardId: string) {
  const { data, error } = await (auth.sbAdmin as any)
    .from('task_leaderboards')
    .select('id')
    .eq('id', leaderboardId)
    .eq('ws_id', auth.wsId)
    .is('archived_at', null)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function GET(request: NextRequest, context: TeamsRouteContext) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { leaderboardId } = await context.params;
    if (!(await requireLeaderboard(auth, leaderboardId))) {
      return taskProgressErrorResponse('Leaderboard not found', 404);
    }

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_leaderboard_teams')
      .select('*')
      .eq('leaderboard_id', leaderboardId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      teams: data ?? [],
    });
  } catch (error) {
    logTaskProgressError('Failed to list task leaderboard teams', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to list task leaderboard teams'
    );
  }
}

export async function POST(request: NextRequest, context: TeamsRouteContext) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { leaderboardId } = await context.params;
    if (!(await requireLeaderboard(auth, leaderboardId))) {
      return taskProgressErrorResponse('Leaderboard not found', 404);
    }

    const body = leaderboardTeamCreateSchema.parse(
      await parseTaskProgressJson(request)
    );
    const { data, error } = await (auth.sbAdmin as any)
      .from('task_leaderboard_teams')
      .insert({
        ...body,
        leaderboard_id: leaderboardId,
        created_by: auth.user.id,
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      team: data,
    });
  } catch (error) {
    logTaskProgressError('Failed to create task leaderboard team', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to create task leaderboard team'
    );
  }
}
