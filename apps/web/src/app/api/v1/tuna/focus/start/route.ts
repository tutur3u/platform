/**
 * Tuna Focus Session Start API
 * POST /api/v1/tuna/focus/start - Start a new focus session
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const startFocusSchema = z.object({
  planned_duration: z.number().int().min(5).max(180), // 5 minutes to 3 hours
  goal: z.string().max(500).optional(),
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
    const parsed = startFocusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { planned_duration, goal } = parsed.data;

    // Check if there's already an active session
    const { data: existingSession } = await supabase
      .from('tuna_focus_sessions')
      .select('id, started_at, planned_duration')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .maybeSingle();

    if (existingSession) {
      return NextResponse.json(
        {
          error: 'You already have an active focus session',
          active_session: existingSession,
        },
        { status: 409 }
      );
    }

    // Create new focus session
    const { data: session, error } = await supabase
      .from('tuna_focus_sessions')
      .insert({
        user_id: user.id,
        planned_duration,
        goal,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating focus session:', error);
      return NextResponse.json(
        { error: 'Failed to start focus session' },
        { status: 500 }
      );
    }

    // Update pet interaction time
    await supabase
      .from('tuna_pets')
      .update({
        last_interaction_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Unexpected error in POST /api/v1/tuna/focus/start:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
