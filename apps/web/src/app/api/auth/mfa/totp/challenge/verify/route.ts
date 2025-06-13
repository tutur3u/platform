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

    const { challengeId, factorId, code } = await request.json();

    if (!challengeId || !factorId || !code) {
      return NextResponse.json(
        {
          error: 'Challenge ID, Factor ID, and verification code are required',
        },
        { status: 400 }
      );
    }

    // Verify the challenge with the provided code
    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.toString().trim(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Challenge verified successfully',
      data,
    });
  } catch (error) {
    console.error('Error verifying challenge:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
