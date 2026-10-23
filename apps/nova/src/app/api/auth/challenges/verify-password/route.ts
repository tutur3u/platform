import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import {
  checkPasswordAttemptLimit,
  type PasswordAttemptSubject,
} from '@tuturuuu/utils/abuse-protection/password-attempt-limits';
import {
  hashPassword,
  MAX_PASSWORD_LENGTH,
  verifyPassword,
} from '@tuturuuu/utils/crypto';
import { NextResponse } from 'next/server';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';
import {
  challengeAccessCookieName,
  challengeAccessTtlSeconds,
  createChallengeAccessGrant,
  LEGACY_CHALLENGE_ACCESS_COOKIE,
} from '@/lib/challenge-access';

export async function POST(request: Request) {
  const user = getNovaAppSessionUserFromRequest(request);

  if (!user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: { challengeId: string; password: string };

  try {
    body = await request.json();
  } catch (_error) {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }

  const sbAdmin = await createAdminClient();

  try {
    const { challengeId, password } = body;

    if (
      typeof challengeId !== 'string' ||
      typeof password !== 'string' ||
      !challengeId ||
      !password ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      return NextResponse.json(
        {
          message: 'Missing required fields: challengeId and password',
        },
        { status: 400 }
      );
    }

    const { data: challenge, error } = await sbAdmin
      .schema('private')
      .from('nova_challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (error || !challenge) {
      return NextResponse.json(
        { message: 'Challenge not found' },
        { status: 404 }
      );
    }

    if (!challenge.password_hash) {
      return NextResponse.json(
        { message: 'Challenge has no password' },
        { status: 400 }
      );
    }

    const attempt: PasswordAttemptSubject = {
      scope: 'nova-challenge',
      target: `${challenge.id}:${user.id}`,
      ip: extractIPFromHeaders(request.headers),
    };
    const limit = await checkPasswordAttemptLimit(attempt);
    if (!limit.allowed) {
      const retryAfter = limit.retryAfter ?? 60;
      return NextResponse.json(
        { message: 'Too many failed attempts', retryAfter },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const verification = await verifyPassword(password, {
      hash: challenge.password_hash,
      salt: challenge.password_salt,
    });

    if (!verification.valid) {
      return NextResponse.json(
        { message: 'Invalid password' },
        { status: 401 }
      );
    }

    if (verification.needsRehash) {
      // Upgrade legacy hashes in place, guarded by the old value so a
      // concurrent password change is never overwritten.
      const { error: rehashError } = await sbAdmin
        .schema('private')
        .from('nova_challenges')
        .update({
          password_hash: await hashPassword(password),
          password_salt: null,
        })
        .eq('id', challenge.id)
        .eq('password_hash', challenge.password_hash);

      if (rehashError) {
        console.warn('Failed to upgrade Nova challenge password hash', {
          message: rehashError.message,
        });
      }
    }

    const ttlSeconds = challengeAccessTtlSeconds(challenge.duration);
    const grant = createChallengeAccessGrant({
      challengeId: challenge.id,
      userId: user.id,
      ttlSeconds,
    });

    const response = NextResponse.json(
      { message: 'Password verified successfully' },
      { status: 200 }
    );
    response.cookies.set(challengeAccessCookieName(challenge.id), grant.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ttlSeconds,
    });
    // Older builds stored password material in this cookie; drop it.
    response.cookies.delete(LEGACY_CHALLENGE_ACCESS_COOKIE);

    return response;
  } catch {
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
