import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  // Build the update object with only allowed fields
  const allowedFields = [
    'completed_steps',
    'current_step',
    'workspace_name',
    'workspace_description',
    'workspace_avatar_url',
    'profile_completed',
    'tour_completed',
    'completed_at',
    'use_case',
    'flow_type',
    'invited_emails',
    'theme_preference',
    'language_preference',
    'notifications_enabled',
    'team_workspace_id',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { message: 'No valid fields to update' },
      { status: 400 }
    );
  }

  // Upsert the onboarding progress
  const { data, error } = await supabase
    .from('onboarding_progress')
    .upsert(
      {
        user_id: user.id,
        ...updates,
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('Error updating onboarding progress:', error);
    return NextResponse.json(
      { message: 'Failed to update onboarding progress' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching onboarding progress:', error);
    return NextResponse.json(
      { message: 'Failed to fetch onboarding progress' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
