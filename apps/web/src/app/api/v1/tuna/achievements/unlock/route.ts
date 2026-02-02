/**
 * Tuna Achievement Unlock API
 * POST /api/v1/tuna/achievements/unlock - Unlock an achievement
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const unlockAchievementSchema = z.object({
  achievement_code: z.string().min(1),
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
    const parsed = unlockAchievementSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { achievement_code } = parsed.data;

    // Get achievement by code
    const { data: achievement, error: achievementError } = await supabase
      .from('tuna_achievements')
      .select('*')
      .eq('code', achievement_code)
      .single();

    if (achievementError || !achievement) {
      return NextResponse.json(
        { error: 'Achievement not found' },
        { status: 404 }
      );
    }

    // Check if already unlocked
    const { data: existingUnlock } = await supabase
      .from('tuna_user_achievements')
      .select('id')
      .eq('user_id', user.id)
      .eq('achievement_id', achievement.id)
      .maybeSingle();

    if (existingUnlock) {
      return NextResponse.json({
        achievement,
        already_unlocked: true,
        message: 'Achievement was already unlocked',
      });
    }

    // Insert unlock record
    const { error: unlockError } = await supabase
      .from('tuna_user_achievements')
      .insert({
        user_id: user.id,
        achievement_id: achievement.id,
      });

    if (unlockError) {
      console.error('Error unlocking achievement:', unlockError);
      return NextResponse.json(
        { error: 'Failed to unlock achievement' },
        { status: 500 }
      );
    }

    // Award XP for the achievement
    let pet = null;
    if (achievement.xp_reward > 0) {
      const { data: updatedPet, error: xpError } = await supabase.rpc(
        'award_tuna_xp',
        {
          p_user_id: user.id,
          p_xp: achievement.xp_reward,
          p_source: `achievement:${achievement_code}`,
        }
      );

      if (xpError) {
        console.error('Error awarding achievement XP:', xpError);
      } else {
        pet = updatedPet;
      }
    }

    // Get updated pet if we didn't get it from XP award
    if (!pet) {
      const { data: currentPet } = await supabase
        .from('tuna_pets')
        .select('*')
        .eq('user_id', user.id)
        .single();
      pet = currentPet;
    }

    return NextResponse.json({
      achievement,
      pet,
      already_unlocked: false,
      xp_earned: achievement.xp_reward,
      message: `Achievement unlocked: ${achievement.name}!`,
    });
  } catch (error) {
    console.error(
      'Unexpected error in POST /api/v1/tuna/achievements/unlock:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
