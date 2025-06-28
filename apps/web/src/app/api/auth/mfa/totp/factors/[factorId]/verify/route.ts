import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

interface Params {
  params: Promise<{
    factorId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const supabase = await createClient();
    const { factorId } = await params;

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await request.json();

    if (!code) {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400 }
      );
    }

    // Use challengeAndVerify for single-step verification
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.toString().trim(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Factor verified successfully',
      data,
    });
  } catch (error) {
    console.error('Error verifying factor:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
