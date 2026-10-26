import {
  createCliAppSession,
  createCliSessionResponseBody,
  verifyCliRefreshToken,
} from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  isKnownReplay,
  preLimitReplayAttempt,
  rememberReplay,
} from '@tuturuuu/utils/abuse-guard/replay-guard';
import { isAbuseGuardFamilyAssigned } from '@tuturuuu/utils/abuse-guard/select';
import { extractIPFromRequest } from '@tuturuuu/utils/abuse-protection/edge';
import {
  readRequiredMfaPolicy,
  satisfiesRequiredMfaPolicy,
} from '@tuturuuu/utils/required-mfa-policy';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCliAppSessionPolicy } from '@/lib/app-coordination/session-policy';

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

const REFRESH_REPLAY_KEY_PREFIX = 'cli:refresh:used';

type RefreshTokenConsumeResult =
  | 'consumed'
  | 'limited'
  | 'replayed'
  | 'unavailable';

async function consumeRefreshTokenOnce({
  exp,
  ip,
  jti,
  sub,
}: {
  exp: number;
  ip: string;
  jti: string;
  sub: string;
}): Promise<RefreshTokenConsumeResult> {
  const ttlSeconds = exp - Math.floor(Date.now() / 1000);

  if (ttlSeconds <= 0 || !jti.trim() || !sub.trim()) {
    return 'replayed';
  }

  const key = `${REFRESH_REPLAY_KEY_PREFIX}:${sub}:${jti}`;
  // Known replays and over-limit callers cost no store operation.
  if (isKnownReplay(key)) return 'replayed';
  if (preLimitReplayAttempt(sub, ip) !== null) return 'limited';

  const redis = await getUpstashRestRedisClient({
    family: 'replay',
  }).catch(() => null);
  if (!redis) {
    return 'unavailable';
  }

  try {
    const consumed = await redis.set(key, '1', {
      ex: ttlSeconds,
      nx: true,
    });

    if (consumed === 'OK') return 'consumed';
    rememberReplay(key, exp);
    return 'replayed';
  } catch {
    return 'unavailable';
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = refreshSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  const verification = verifyCliRefreshToken(parsed.data.refreshToken);

  if (!verification.ok) {
    return NextResponse.json(
      { error: 'Invalid or expired refresh token' },
      { status: 401 }
    );
  }

  const consumeResult = await consumeRefreshTokenOnce({
    exp: verification.claims.exp,
    ip: extractIPFromRequest(request.headers),
    jti: verification.claims.jti,
    sub: verification.claims.sub,
  });

  if (consumeResult === 'limited') {
    return NextResponse.json(
      { error: 'Too many refresh attempts' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
  if (consumeResult === 'unavailable') {
    // Legacy policy continues without the fence; once the guard store owns
    // replay fences, an unavailable store fails closed.
    if (isAbuseGuardFamilyAssigned('replay')) {
      return NextResponse.json(
        { error: 'Refresh temporarily unavailable' },
        { status: 503, headers: { 'Retry-After': '30' } }
      );
    }
    console.warn('CLI refresh replay protection unavailable; continuing');
  } else if (consumeResult === 'replayed') {
    return NextResponse.json(
      { error: 'Invalid or expired refresh token' },
      { status: 401 }
    );
  }

  const sbAdmin = await createAdminClient({ noCookie: true });
  const { data, error } = await sbAdmin.auth.admin.getUserById(
    verification.claims.sub
  );

  if (error || !data.user) {
    return NextResponse.json(
      { error: 'Invalid or expired refresh token' },
      { status: 401 }
    );
  }

  if (
    !satisfiesRequiredMfaPolicy(
      readRequiredMfaPolicy(data.user.app_metadata),
      verification.claims.mfa ?? null
    )
  ) {
    return NextResponse.json(
      { code: 'MFA_REQUIRED', error: 'MFA verification required' },
      { status: 403 }
    );
  }
  const policy = await getCliAppSessionPolicy();
  const session = createCliAppSession({
    accessExpiresInSeconds: policy.cliAccessTtlSeconds,
    email: data.user.email ?? verification.claims.email,
    mfa: verification.claims.mfa,
    refreshExpiresInSeconds: policy.cliRefreshTtlSeconds,
    userId: verification.claims.sub,
  });

  return NextResponse.json(createCliSessionResponseBody(session));
}
