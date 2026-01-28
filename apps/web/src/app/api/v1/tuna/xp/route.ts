/**
 * Tuna XP API
 * POST /api/v1/tuna/xp - Award XP to user's Tuna pet
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const awardXpSchema = z.object({
  amount: z.number().int().min(1).max(1000),
  source: z.string().optional(),
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
    const parsed = awardXpSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { amount, source } = parsed.data;

    // Get current pet state for level comparison
    const { data: beforePet } = await supabase
      .from('tuna_pets')
      .select('level')
      .eq('user_id', user.id)
      .single();

    const beforeLevel = beforePet?.level || 1;

    // Award XP using database function
    const { data: pet, error } = await supabase.rpc('award_tuna_xp', {
      p_user_id: user.id,
      p_xp: amount,
      p_source: source ?? undefined,
    });

    if (error) {
      console.error('Error awarding XP:', error);
      return NextResponse.json(
        { error: 'Failed to award XP' },
        { status: 500 }
      );
    }

    const leveledUp = pet.level > beforeLevel;

    return NextResponse.json({
      pet,
      leveled_up: leveledUp,
      ...(leveledUp && { new_level: pet.level }),
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/v1/tuna/xp:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
