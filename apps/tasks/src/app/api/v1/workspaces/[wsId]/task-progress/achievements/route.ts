import { connection, type NextRequest, NextResponse } from 'next/server';
import { levelProgress } from '../_gamification';
import { syncTaskProgressGamification } from '../_gamification-sync';
import {
  isTaskProgressSchemaUnavailableError,
  logTaskProgressError,
  resolveTaskProgressRouteAuth,
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
    const sync = await syncTaskProgressGamification(
      auth.sbAdmin,
      auth.wsId,
      auth.user.id
    );

    const { data: catalog, error: catalogError } = await (auth.sbAdmin as any)
      .from('task_progress_achievements')
      .select('*')
      .eq('ws_id', auth.wsId)
      .order('sort_order', { ascending: true });
    if (catalogError) throw catalogError;

    const { data: unlocks, error: unlockError } = await (auth.sbAdmin as any)
      .from('task_progress_user_achievements')
      .select('achievement_code, unlocked_at')
      .eq('ws_id', auth.wsId)
      .eq('user_id', auth.user.id);
    if (unlockError) throw unlockError;

    const unlockedAt = new Map<string, string>(
      (unlocks ?? []).map((row: any) => [row.achievement_code, row.unlocked_at])
    );

    const achievements = (catalog ?? []).map((achievement: any) => ({
      ...achievement,
      unlocked: unlockedAt.has(achievement.code),
      unlocked_at: unlockedAt.get(achievement.code) ?? null,
    }));

    const progress = levelProgress(sync.xp);

    return NextResponse.json({
      ok: true,
      schemaAvailable: true,
      achievements,
      stats: {
        xp: sync.xp,
        level: sync.level,
        streak_freezes: sync.streakFreezes,
        next_level_xp: progress.nextLevelXp,
        current_level_xp: progress.currentLevelXp,
        into_level: progress.intoLevel,
        level_span: progress.span,
        level_percent: progress.percent,
        unlocked_count: sync.unlocked.length,
        total_count: achievements.length,
      },
      newlyUnlocked: sync.newlyUnlocked,
    });
  } catch (error) {
    if (isTaskProgressSchemaUnavailableError(error)) {
      return taskProgressSchemaUnavailableResponse({
        achievements: [],
        stats: null,
        newlyUnlocked: [],
      });
    }
    logTaskProgressError('Failed to load task progress achievements', error);
    return taskProgressRouteErrorResponse(
      error,
      'Failed to load task progress achievements'
    );
  }
}
