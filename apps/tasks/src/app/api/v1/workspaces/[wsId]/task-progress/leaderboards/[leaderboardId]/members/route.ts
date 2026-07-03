import { type NextRequest, NextResponse } from 'next/server';
import {
  leaderboardMemberCreateSchema,
  logTaskProgressError,
  parseTaskProgressJson,
  resolveTaskProgressRouteAuth,
  taskProgressErrorResponse,
  taskProgressRouteErrorResponse,
} from '../../../_utils';

type MembersRouteContext = {
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

async function requireTeam(
  auth: any,
  leaderboardId: string,
  teamId?: string | null
) {
  if (!teamId) return true;

  const { data, error } = await (auth.sbAdmin as any)
    .from('task_leaderboard_teams')
    .select('id')
    .eq('id', teamId)
    .eq('leaderboard_id', leaderboardId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function requireWorkspaceUser(auth: any, userId: string) {
  const { data, error } = await (auth.sbAdmin as any)
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', auth.wsId)
    .eq('user_id', userId)
    .eq('type', 'MEMBER')
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function GET(request: NextRequest, context: MembersRouteContext) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { leaderboardId } = await context.params;
    if (!(await requireLeaderboard(auth, leaderboardId))) {
      return taskProgressErrorResponse('Leaderboard not found', 404);
    }

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_leaderboard_members')
      .select('*, team:task_leaderboard_teams(*)')
      .eq('leaderboard_id', leaderboardId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      members: data ?? [],
    });
  } catch (error) {
    logTaskProgressError('Failed to list task leaderboard members', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to list task leaderboard members'
    );
  }
}

export async function POST(request: NextRequest, context: MembersRouteContext) {
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const { leaderboardId } = await context.params;
    if (!(await requireLeaderboard(auth, leaderboardId))) {
      return taskProgressErrorResponse('Leaderboard not found', 404);
    }

    const body = leaderboardMemberCreateSchema.parse(
      await parseTaskProgressJson(request)
    );
    const userId = body.user_id ?? auth.user.id;

    if (!(await requireWorkspaceUser(auth, userId))) {
      return taskProgressErrorResponse('User is not a workspace member', 403);
    }

    if (!(await requireTeam(auth, leaderboardId, body.team_id))) {
      return taskProgressErrorResponse('Team not found', 404);
    }

    const { data, error } = await (auth.sbAdmin as any)
      .from('task_leaderboard_members')
      .upsert(
        {
          leaderboard_id: leaderboardId,
          user_id: userId,
          team_id: body.team_id ?? null,
          display_name: body.display_name ?? null,
          status: 'active',
          joined_by: auth.user.id,
        },
        { onConflict: 'leaderboard_id,user_id' }
      )
      .select('*, team:task_leaderboard_teams(*)')
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      member: data,
    });
  } catch (error) {
    logTaskProgressError('Failed to add task leaderboard member', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to add task leaderboard member'
    );
  }
}
