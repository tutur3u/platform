/**
 * Tuna Pet API
 * GET /api/v1/tuna/pet - Get user's Tuna pet state
 * PATCH /api/v1/tuna/pet - Update pet (name, etc.)
 */

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updatePetSchema = z.object({
  name: z.string().min(1).max(50).optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get or create pet using database function
    const sbAdmin = await createAdminClient();
    const { data: pet, error: petError } = await sbAdmin.rpc(
      'get_or_create_tuna_pet',
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
        .from('tuna_user_accessories')
        .select(
          `
        is_equipped,
        unlocked_at,
        accessory:tuna_accessories(*)
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
      .from('tuna_daily_stats')
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
    console.error('Unexpected error in GET /api/v1/tuna/pet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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
      .from('tuna_pets')
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
    console.error('Unexpected error in PATCH /api/v1/tuna/pet:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
