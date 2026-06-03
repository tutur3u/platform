import {
  createAppSessionTokenPair,
  verifyAppSessionRefreshToken,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session';
import { resolveInternalAppSessionPolicy } from '@tuturuuu/auth/app-session-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type AppName,
  getAppDomainMap,
} from '@tuturuuu/utils/internal-domains';
import { getUpstashRestRedisClient } from '@tuturuuu/utils/upstash-rest';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppCoordinationSessionPolicy } from '@/lib/app-coordination/session-policy';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

const REFRESH_REPLAY_KEY_PREFIX = 'app-session:refresh:used';

const refreshSchema = z.object({
  accessToken: z.string().trim().min(1).optional(),
  refreshToken: z.string().trim().min(1).optional(),
  targetApp: z.string().trim().toLowerCase().min(1).max(64),
});

type RefreshConsumeResult = 'consumed' | 'grace' | 'replayed' | 'unavailable';

function isRegisteredAppName(value: string): value is AppName {
  return getAppDomainMap().some((domain) => domain.name === value);
}

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store');

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

async function consumeRefreshTokenWithGrace({
  exp,
  graceSeconds,
  jti,
  sub,
}: {
  exp: number;
  graceSeconds: number;
  jti: string;
  sub: string;
}): Promise<RefreshConsumeResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds = exp - nowSeconds;

  if (ttlSeconds <= 0 || !jti.trim() || !sub.trim()) {
    return 'replayed';
  }

  const redis = await getUpstashRestRedisClient().catch(() => null);
  if (!redis) {
    return 'unavailable';
  }

  const key = `${REFRESH_REPLAY_KEY_PREFIX}:${sub}:${jti}`;

  try {
    const firstUsedAt = await redis.get<number | string>(key);
    const firstUsedAtSeconds =
      typeof firstUsedAt === 'number'
        ? firstUsedAt
        : Number.parseInt(firstUsedAt ?? '', 10);

    if (Number.isFinite(firstUsedAtSeconds)) {
      return firstUsedAtSeconds + graceSeconds >= nowSeconds
        ? 'grace'
        : 'replayed';
    }

    const consumed = await redis.set(key, String(nowSeconds), {
      ex: ttlSeconds,
      nx: true,
    });

    return consumed === 'OK' ? 'consumed' : 'replayed';
  } catch (error) {
    serverLogger.warn('App-session refresh replay check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'unavailable';
  }
}

async function verifyRefreshToken({
  refreshToken,
  replayGraceSeconds,
  targetApp,
}: {
  refreshToken: string;
  replayGraceSeconds: number;
  targetApp: AppName;
}) {
  const verification = verifyAppSessionRefreshToken(refreshToken, {
    targetApp,
  });

  if (!verification.ok) {
    return verification;
  }

  const consumeResult = await consumeRefreshTokenWithGrace({
    exp: verification.claims.exp,
    graceSeconds: replayGraceSeconds,
    jti: verification.claims.jti,
    sub: verification.claims.sub,
  });

  if (consumeResult === 'replayed') {
    return {
      error: 'Invalid or expired refresh token',
      ok: false as const,
    };
  }

  return verification;
}

function verifyLegacyAccessToken({
  accessToken,
  targetApp,
}: {
  accessToken?: string;
  targetApp: AppName;
}) {
  if (!accessToken) {
    return {
      error: 'Missing app session access token',
      ok: false as const,
    };
  }

  return verifyAppSessionToken(accessToken, {
    targetApp,
  });
}

async function refreshCrossAppSession(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = refreshSchema.safeParse(body);

  if (!parsed.success || !isRegisteredAppName(parsed.data.targetApp)) {
    return jsonNoStore(
      { error: 'Invalid app-session refresh payload' },
      { status: 400 }
    );
  }

  const { accessToken, refreshToken, targetApp } = parsed.data;

  if (!accessToken && !refreshToken) {
    return jsonNoStore(
      { error: 'Missing app session refresh credentials' },
      { status: 401 }
    );
  }

  const { policy } = await getAppCoordinationSessionPolicy();
  const verification = refreshToken
    ? await verifyRefreshToken({
        refreshToken,
        replayGraceSeconds: policy.browserRefreshReplayGraceSeconds,
        targetApp,
      })
    : verifyLegacyAccessToken({
        accessToken,
        targetApp,
      });

  if (!verification.ok) {
    return jsonNoStore(
      { error: 'Invalid or expired app session refresh credentials' },
      { status: 401 }
    );
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const { data, error } = await sbAdmin.auth.admin.getUserById(
    verification.claims.sub
  );

  if (error || !data.user) {
    return jsonNoStore(
      { error: 'Invalid or expired app session refresh credentials' },
      { status: 401 }
    );
  }

  const internalAppSessionPolicy = resolveInternalAppSessionPolicy(
    policy,
    targetApp
  );
  const session = createAppSessionTokenPair(
    {
      email: data.user.email ?? verification.claims.email,
      targetApp,
      userId: verification.claims.sub,
    },
    {
      policy: internalAppSessionPolicy,
    }
  );

  return jsonNoStore({
    appSessionExpiresAt: session.access.expiresAt,
    appSessionRefreshEarlySeconds: session.refreshEarlySeconds,
    appSessionRefreshExpiresAt: session.refresh.expiresAt,
    appSessionRefreshToken: session.refresh.token,
    appSessionToken: session.access.token,
    internalAppSessionPolicy,
    sessionData: {
      email: data.user.email ?? verification.claims.email,
    },
    userId: verification.claims.sub,
    valid: true,
  });
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/auth/cross-app-session/refresh',
    },
    () => refreshCrossAppSession(request)
  );
}
