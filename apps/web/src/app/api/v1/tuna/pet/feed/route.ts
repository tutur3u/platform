/**
 * Tuna Feed API
 * POST /api/v1/tuna/pet/feed - Feed Tuna
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

const FEED_HUNGER_INCREASE = 30;
const FEED_XP_REWARD = 5;
const FEED_COOLDOWN_HOURS = 4;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current pet state
    const { data: pet, error: getPetError } = await supabase
      .from('tuna_pets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (getPetError || !pet) {
      return NextResponse.json(
        { error: 'Pet not found. Please create a pet first.' },
        { status: 404 }
      );
    }

    // Check cooldown
    const lastFed = new Date(pet.last_fed_at);
    const now = new Date();
    const hoursSinceLastFed =
      (now.getTime() - lastFed.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastFed < FEED_COOLDOWN_HOURS) {
      const minutesRemaining = Math.ceil(
        (FEED_COOLDOWN_HOURS - hoursSinceLastFed) * 60
      );
      return NextResponse.json(
        {
          error: `Tuna is not hungry yet! Wait ${minutesRemaining} more minutes.`,
          cooldown_remaining_minutes: minutesRemaining,
        },
        { status: 429 }
      );
    }

    // Calculate new hunger (capped at 100)
    const newHunger = Math.min(pet.hunger + FEED_HUNGER_INCREASE, 100);

    // Update pet with new hunger and last_fed_at
    const { data: updatedPet, error: updateError } = await supabase
      .from('tuna_pets')
      .update({
        hunger: newHunger,
        last_fed_at: now.toISOString(),
        last_interaction_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error feeding pet:', updateError);
      return NextResponse.json(
        { error: 'Failed to feed pet' },
        { status: 500 }
      );
    }

    // Award XP for feeding
    const { error: xpError } = await supabase.rpc('award_tuna_xp', {
      p_user_id: user.id,
      p_xp: FEED_XP_REWARD,
      p_source: 'feeding',
    });

    if (xpError) {
      console.error('Error awarding feeding XP:', xpError);
      // Don't fail the request, feeding was successful
    }

    // Get updated pet (with new XP)
    const { data: finalPet } = await supabase
      .from('tuna_pets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const messages = [
      'Yum yum! Tuna loves the treat!',
      'Tuna gobbles it up happily!',
      '*happy fish noises*',
      'Tuna does a little happy wiggle!',
      'That hit the spot! Thank you!',
    ];

    return NextResponse.json({
      pet: finalPet || updatedPet,
      xp_earned: FEED_XP_REWARD,
      message: messages[Math.floor(Math.random() * messages.length)],
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/v1/tuna/pet/feed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
