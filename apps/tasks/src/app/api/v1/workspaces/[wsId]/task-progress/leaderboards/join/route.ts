import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { syncTaskProgressGamification } from '../../_gamification-sync';
import {
  logTaskProgressError,
  parseTaskProgressJson,
  resolveTaskProgressRouteAuth,
  type TaskProgressRouteContext,
  taskProgressErrorResponse,
  taskProgressRouteErrorResponse,
} from '../../_utils';

const joinSchema = z.object({
  join_code: z.string().trim().min(4).max(40),
  display_name: z.string().trim().max(120).nullable().optional(),
});

const leaveSchema = z.object({
  join_code: z.string().trim().min(4).max(40),
});

async function findLeaderboardByCode(auth: any, joinCode: string) {
  const { data, error } = await (auth.sbAdmin as any)
    .from('task_leaderboards')
    .select('id, name, ws_id, status')
    .eq('ws_id', auth.wsId)
    .eq('join_code', joinCode.toLowerCase())
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function POST(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  await connection();
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = joinSchema.parse(await parseTaskProgressJson(request));
    const leaderboard = await findLeaderboardByCode(auth, body.join_code);
    if (leaderboard?.status !== 'active') {
      return taskProgressErrorResponse('Leaderboard not found', 404);
    }

    const { data: member, error } = await (auth.sbAdmin as any)
      .from('task_leaderboard_members')
      .upsert(
        {
          leaderboard_id: leaderboard.id,
          user_id: auth.user.id,
          display_name: body.display_name ?? null,
          status: 'active',
          joined_by: auth.user.id,
        },
        { onConflict: 'leaderboard_id,user_id' }
      )
      .select('*, team:task_leaderboard_teams(*)')
      .single();
    if (error) throw error;

    // Unlock the "Team player" achievement + refresh XP.
    let newlyUnlocked: string[] = [];
    try {
      const sync = await syncTaskProgressGamification(
        auth.sbAdmin,
        auth.wsId,
        auth.user.id
      );
      newlyUnlocked = sync.newlyUnlocked;
    } catch (syncError) {
      logTaskProgressError('Gamification sync failed after join', syncError);
    }

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      leaderboard: { id: leaderboard.id, name: leaderboard.name },
      member,
      newlyUnlocked,
    });
  } catch (error) {
    logTaskProgressError('Failed to join task leaderboard', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to join task leaderboard'
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: TaskProgressRouteContext
) {
  await connection();
  const auth = await resolveTaskProgressRouteAuth(request, context);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = leaveSchema.parse(await parseTaskProgressJson(request));
    const leaderboard = await findLeaderboardByCode(auth, body.join_code);
    if (!leaderboard) {
      return taskProgressErrorResponse('Leaderboard not found', 404);
    }

    const { error } = await (auth.sbAdmin as any)
      .from('task_leaderboard_members')
      .update({ status: 'left' })
      .eq('leaderboard_id', leaderboard.id)
      .eq('user_id', auth.user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true, schemaAvailable: true, left: true });
  } catch (error) {
    logTaskProgressError('Failed to leave task leaderboard', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to leave task leaderboard'
    );
  }
}
