import { generateCrossAppToken } from '@tuturuuu/auth/cross-app';
import { createClient } from '@tuturuuu/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
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

    // Get the request body
    const body = await request.json();
    const { targetApp, expirySeconds = 300 } = body;

    if (!targetApp) {
      return NextResponse.json(
        { error: 'Missing required parameter: targetApp' },
        { status: 400 }
      );
    }

    // Generate a cross-app token
    const token = await generateCrossAppToken(
      supabase,
      targetApp,
      'web',
      expirySeconds
    );

    if (!token) {
      console.log('Failed to generate token');
      return NextResponse.json(
        { error: 'Failed to generate token' },
        { status: 500 }
      );
    }

    // Return the token
    return NextResponse.json({ token });
  } catch (error) {
    console.error('Error generating cross-app token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
