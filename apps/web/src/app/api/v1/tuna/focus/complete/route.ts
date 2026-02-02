/**
 * Tuna Focus Session Complete API
 * POST /api/v1/tuna/focus/complete - Complete/end a focus session
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const completeFocusSchema = z.object({
  session_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = completeFocusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { session_id, notes } = parsed.data;

    // Get the session
    const { data: session, error: sessionError } = await supabase
      .from('tuna_focus_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Focus session not found' },
        { status: 404 }
      );
    }

    if (session.ended_at) {
      return NextResponse.json(
        { error: 'Focus session is already completed' },
        { status: 400 }
      );
    }

    // Complete the session using database function
    const { data: completedSession, error: completeError } = await supabase.rpc(
      'complete_tuna_focus_session',
      {
        p_session_id: session_id,
        p_notes: notes ?? undefined,
      }
    );

    if (completeError) {
      console.error('Error completing focus session:', completeError);
      return NextResponse.json(
        { error: 'Failed to complete focus session' },
        { status: 500 }
      );
    }

    // Get updated pet
    const { data: pet } = await supabase
      .from('tuna_pets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Get user's achievement status
    const { data: unlockedAchievements } = await supabase
      .from('tuna_user_achievements')
      .select('achievement:tuna_achievements(code)')
      .eq('user_id', user.id);

    const unlockedCodes = new Set(
      (unlockedAchievements || []).map(
        (ua) => (ua.achievement as { code: string })?.code
      )
    );

    // Get focus session count
    const { count: totalSessions } = await supabase
      .from('tuna_focus_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('ended_at', 'is', null);

    // Get today's completed sessions
    const today = new Date().toISOString().split('T')[0] ?? '';
    const { data: dailyStats } = await supabase
      .from('tuna_daily_stats')
      .select('focus_sessions_completed')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    // Check and unlock achievements
    const newlyUnlocked: string[] = [];

    const checkAndUnlock = async (code: string, condition: boolean) => {
      if (condition && !unlockedCodes.has(code)) {
        const { data: achievement } = await supabase
          .from('tuna_achievements')
          .select('id')
          .eq('code', code)
          .single();

        if (achievement) {
          await supabase.from('tuna_user_achievements').insert({
            user_id: user.id,
            achievement_id: achievement.id,
          });
          newlyUnlocked.push(code);
        }
      }
    };

    // Check each achievement
    await checkAndUnlock('first_focus', (totalSessions || 0) >= 1);
    await checkAndUnlock('focus_10', (totalSessions || 0) >= 10);
    await checkAndUnlock('focus_50', (totalSessions || 0) >= 50);
    await checkAndUnlock(
      'long_focus',
      completedSession.planned_duration >= 60 && completedSession.completed
    );
    await checkAndUnlock(
      'total_focus_100',
      (pet?.total_focus_minutes || 0) >= 100
    );
    await checkAndUnlock(
      'total_focus_1000',
      (pet?.total_focus_minutes || 0) >= 1000
    );
    await checkAndUnlock(
      'perfect_day',
      (dailyStats?.focus_sessions_completed || 0) >= 3
    );

    // Get full achievement details for newly unlocked
    let unlockedAchievementDetails: unknown[] = [];
    if (newlyUnlocked.length > 0) {
      const { data: achievements } = await supabase
        .from('tuna_achievements')
        .select('*')
        .in('code', newlyUnlocked);
      unlockedAchievementDetails = achievements || [];

      // Award XP for achievements
      for (const achievement of unlockedAchievementDetails as {
        xp_reward: number;
        code: string;
      }[]) {
        if (achievement.xp_reward > 0) {
          await supabase.rpc('award_tuna_xp', {
            p_user_id: user.id,
            p_xp: achievement.xp_reward,
            p_source: `achievement:${achievement.code}`,
          });
        }
      }
    }

    // Get final pet state
    const { data: finalPet } = await supabase
      .from('tuna_pets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      session: completedSession,
      pet: finalPet || pet,
      xp_earned: completedSession.xp_earned,
      achievements_unlocked: unlockedAchievementDetails,
    });
  } catch (error) {
    console.error(
      'Unexpected error in POST /api/v1/tuna/focus/complete:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
