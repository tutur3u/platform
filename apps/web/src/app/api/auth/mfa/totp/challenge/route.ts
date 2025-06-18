import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { factorId } = await request.json();

    if (!factorId) {
      return NextResponse.json(
        { error: 'Factor ID is required' },
        { status: 400 }
      );
    }

    // Create a challenge for the given factor
    const { data, error } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error creating challenge:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
