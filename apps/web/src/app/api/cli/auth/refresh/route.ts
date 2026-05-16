import {
  createCliAppSession,
  createCliSessionResponseBody,
  verifyCliRefreshToken,
} from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

const REFRESH_REPLAY_KEY_PREFIX = 'cli:refresh:used';

type RefreshTokenConsumeResult = 'consumed' | 'replayed' | 'unavailable';

async function consumeRefreshTokenOnce({
  exp,
  jti,
  sub,
}: {
  exp: number;
  jti: string;
  sub: string;
}): Promise<RefreshTokenConsumeResult> {
  const ttlSeconds = exp - Math.floor(Date.now() / 1000);

  if (ttlSeconds <= 0 || !jti.trim() || !sub.trim()) {
    return 'replayed';
  }

  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) {
    return 'unavailable';
  }

  const key = `${REFRESH_REPLAY_KEY_PREFIX}:${sub}:${jti}`;
  try {
    const consumed = await redis.set(key, '1', {
      ex: ttlSeconds,
      nx: true,
    });

    return consumed === 'OK' ? 'consumed' : 'replayed';
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
    jti: verification.claims.jti,
    sub: verification.claims.sub,
  });

  if (consumeResult === 'unavailable') {
    return NextResponse.json(
      { error: 'Refresh token replay protection unavailable' },
      { status: 503 }
    );
  }

  if (consumeResult !== 'consumed') {
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

  const session = createCliAppSession({
    email: data.user.email ?? verification.claims.email,
    userId: verification.claims.sub,
  });

  return NextResponse.json(createCliSessionResponseBody(session));
}
