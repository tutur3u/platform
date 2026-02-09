import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/api-auth';

const PatchProfileSchema = z.object({
  display_name: z.string().max(50).optional(),
  avatar_url: z.string().url().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData!;

  try {
    // Fetch user profile data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, display_name, avatar_url, created_at')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return NextResponse.json(
        { message: 'Error fetching user profile' },
        { status: 500 }
      );
    }

    // Fetch private details (includes email)
    const { data: privateData } = await supabase
      .from('user_private_details')
      .select('full_name, new_email, email')
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      id: userData.id,
      email: privateData?.email || user.email || null,
      display_name: userData.display_name,
      avatar_url: userData.avatar_url,
      full_name: privateData?.full_name || null,
      new_email: privateData?.new_email || null,
      created_at: userData.created_at,
    });
  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json(
      {
        message: 'Error processing request',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const { data: authData, error: authError } = await authorizeRequest(req);
  if (authError || !authData)
    return (
      authError ||
      NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    );

  const { user, supabase } = authData!;

  try {
    const body = await req.json();
    const validatedData = PatchProfileSchema.parse(body);

    const updates: Record<string, any> = {};

    if ('display_name' in validatedData) {
      updates.display_name = validatedData.display_name;
    }

    if ('avatar_url' in validatedData) {
      updates.avatar_url = validatedData.avatar_url;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id);

    if (error) {
      console.error('Error updating user:', error);
      return NextResponse.json(
        { message: 'Error updating profile', error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Profile updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: 'Invalid request data', errors: error.issues },
        { status: 400 }
      );
    }

    console.error('Request error:', error);
    return NextResponse.json(
      {
        message: 'Error processing request',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
