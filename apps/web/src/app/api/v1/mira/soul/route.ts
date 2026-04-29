/**
 * Mira Soul API
 * GET  /api/v1/mira/soul - Get user's mira_soul config
 * PATCH /api/v1/mira/soul - Upsert mira_soul (name, tone, etc.)
 */

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateSoulSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  tone: z.string().max(50).optional(),
  personality: z.string().max(2000).optional(),
  boundaries: z.string().max(2000).optional(),
  vibe: z.string().max(100).optional(),
  push_tone: z.string().max(50).optional(),
  chat_tone: z.string().max(50).optional(),
});

export async function GET(request: Request) {
  try {
    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: soul, error } = await supabase
      .from('mira_soul')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching mira_soul:', error);
      return NextResponse.json(
        { error: 'Failed to fetch soul data' },
        { status: 500 }
      );
    }

    return NextResponse.json({ soul: soul ?? { name: 'Mira' } });
  } catch (error) {
    console.error('Unexpected error in GET /api/v1/mira/soul:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient(request);
    const { user } = await resolveAuthenticatedSessionUser(supabase);

    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = updateSoulSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const updates = parsed.data;

    // Upsert: update if exists, insert if not
    const { data: soul, error } = await supabase
      .from('mira_soul')
      .upsert(
        {
          user_id: user.id,
          ...updates,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error upserting mira_soul:', error);
      return NextResponse.json(
        { error: 'Failed to update soul data' },
        { status: 500 }
      );
    }

    return NextResponse.json({ soul });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/v1/mira/soul:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
