import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  checkMFAVerifyLimit,
  clearMFAVerifyFailures,
  extractIPFromHeaders,
  recordMFAVerifyFailure,
} from '@tuturuuu/utils/abuse-protection';
import {
  clearMFAVerifySubjectFailures,
  reserveMFAVerifySubjectAttempt,
} from '@tuturuuu/utils/abuse-protection/mfa-subject-limits';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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

    // Get the current user
    const { user, authError: userError } =
      await resolveAuthenticatedSessionUser(supabase);

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

    // Per-account budget: follows the user and factor across source IPs.
    // The attempt is reserved before contacting Auth so parallel requests
    // cannot outrun the counter; a valid code clears it.
    const subject = { userId: user.id, factorId: String(factorId) };
    const subjectCheck = await reserveMFAVerifySubjectAttempt(subject);
    if (!subjectCheck.allowed) {
      return NextResponse.json(
        {
          error: subjectCheck.reason || 'Too many failed attempts',
          retryAfter: subjectCheck.retryAfter,
        },
        { status: 429 }
      );
    }

    // Verify the challenge with the provided code
    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.toString().trim(),
    });

    if (error) {
      // Record the failure for abuse tracking
      await recordMFAVerifyFailure(ipAddress);
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 400 }
      );
    }

    // Clear failures on success
    await clearMFAVerifyFailures(ipAddress);
    await clearMFAVerifySubjectFailures(subject);

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
