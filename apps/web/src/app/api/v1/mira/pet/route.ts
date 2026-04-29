/**
 * Mira Pet API
 * GET /api/v1/mira/pet - Get user's Mira pet state
 * PATCH /api/v1/mira/pet - Update pet (name, etc.)
 */

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_COLOR_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updatePetSchema = z.object({
  name: z.string().min(1).max(MAX_COLOR_LENGTH).optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get or create pet using database function
    const sbAdmin = await createAdminClient();
    const { data: pet, error: petError } = await sbAdmin.rpc(
      'get_or_create_mira_pet',
      { p_user_id: user.id }
    );

    if (petError) {
      console.error('Error getting/creating pet:', petError);
      return NextResponse.json(
        { error: 'Failed to get pet data' },
        { status: 500 }
      );
    }

    // Get equipped accessories
    const { data: equippedAccessories, error: accessoriesError } =
      await supabase
        .from('mira_user_accessories')
        .select(
          `
        is_equipped,
        unlocked_at,
        accessory:mira_accessories(*)
      `
        )
        .eq('user_id', user.id)
        .eq('is_equipped', true);

    if (accessoriesError) {
      console.error('Error getting accessories:', accessoriesError);
    }

    // Get today's stats
    const today = new Date().toISOString().split('T')[0] ?? '';
    const { data: dailyStats } = await supabase
      .from('mira_daily_stats')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    return NextResponse.json({
      pet,
      equipped_accessories: equippedAccessories || [],
      daily_stats: dailyStats,
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/v1/mira/pet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = updatePetSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { name } = parsed.data;

    // Update pet
    const { data: pet, error } = await supabase
      .from('mira_pets')
      .update({
        ...(name && { name }),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating pet:', error);
      return NextResponse.json(
        { error: 'Failed to update pet' },
        { status: 500 }
      );
    }

    return NextResponse.json({ pet });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/v1/mira/pet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
