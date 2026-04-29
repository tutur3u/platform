/**
 * Mira Achievements API
 * GET /api/v1/mira/achievements - Get all achievements with unlock status
 */

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all achievements
    const { data: achievements, error: achievementsError } = await supabase
      .from('mira_achievements')
      .select('*')
      .order('category')
      .order('sort_order');

    if (achievementsError) {
      console.error('Error getting achievements:', achievementsError);
      return NextResponse.json(
        { error: 'Failed to get achievements' },
        { status: 500 }
      );
    }

    // Get user's unlocked achievements
    const { data: userAchievements, error: userAchievementsError } =
      await supabase
        .from('mira_user_achievements')
        .select('achievement_id, unlocked_at')
        .eq('user_id', user.id);

    if (userAchievementsError) {
      console.error('Error getting user achievements:', userAchievementsError);
    }

    // Create a map of unlocked achievements
    const unlockedMap = new Map(
      (userAchievements || []).map((ua) => [ua.achievement_id, ua.unlocked_at])
    );

    // Merge achievements with unlock status
    const achievementsWithStatus = (achievements || []).map((achievement) => ({
      ...achievement,
      is_unlocked: unlockedMap.has(achievement.id),
      unlocked_at: unlockedMap.get(achievement.id) || null,
    }));

    // Group by category
    const groupedAchievements = achievementsWithStatus.reduce(
      (acc, achievement) => {
        const category = achievement.category;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(achievement);
        return acc;
      },
      {} as Record<string, typeof achievementsWithStatus>
    );

    // Calculate stats
    const totalAchievements = achievements?.length || 0;
    const unlockedCount = userAchievements?.length || 0;
    const totalXpFromAchievements = (userAchievements || []).reduce(
      (sum, ua) => {
        const achievement = achievements?.find(
          (a) => a.id === ua.achievement_id
        );
        return sum + (achievement?.xp_reward || 0);
      },
      0
    );

    return NextResponse.json({
      achievements: achievementsWithStatus,
      grouped: groupedAchievements,
      stats: {
        total: totalAchievements,
        unlocked: unlockedCount,
        total_xp_earned: totalXpFromAchievements,
        completion_percentage: Math.round(
          (unlockedCount / totalAchievements) * 100
        ),
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/v1/mira/achievements:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
