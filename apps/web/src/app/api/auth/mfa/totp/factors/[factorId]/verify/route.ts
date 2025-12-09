import { createClient } from '@tuturuuu/supabase/next/server';
import {
  checkMFAVerifyLimit,
  clearMFAVerifyFailures,
  extractIPFromHeaders,
  recordMFAVerifyFailure,
} from '@tuturuuu/utils/abuse-protection';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    factorId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    // Get IP address for abuse tracking
    const ipAddress = extractIPFromHeaders(request.headers);

    // Check rate limit for MFA verification
    const abuseCheck = await checkMFAVerifyLimit(ipAddress);
    if (!abuseCheck.allowed) {
      return NextResponse.json(
        {
          error: abuseCheck.reason || 'Too many failed attempts',
          retryAfter: abuseCheck.retryAfter,
        },
        { status: 429 }
      );
    }

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
      // Record the failure for abuse tracking
      void recordMFAVerifyFailure(ipAddress);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Clear failures on success
    void clearMFAVerifyFailures(ipAddress);

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
