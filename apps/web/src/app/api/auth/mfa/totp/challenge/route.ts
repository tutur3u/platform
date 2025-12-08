import { createClient } from '@tuturuuu/supabase/next/server';
import {
  checkMFAChallengeLimit,
  extractIPFromHeaders,
} from '@tuturuuu/utils/abuse-protection';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Get IP address for abuse tracking
    const ipAddress = extractIPFromHeaders(request.headers);

    // Check rate limit for MFA challenges
    const abuseCheck = await checkMFAChallengeLimit(ipAddress);
    if (!abuseCheck.allowed) {
      return NextResponse.json(
        {
          error: abuseCheck.reason || 'Too many requests',
          retryAfter: abuseCheck.retryAfter,
        },
        { status: 429 }
      );
    }

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
