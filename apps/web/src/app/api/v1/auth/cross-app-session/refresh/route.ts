import {
  APP_REDEEM_PROOF_HEADER,
  requiresWorkerRedeemProof,
  verifyAppRedeemProof,
} from '@tuturuuu/auth/app-redeem-proof';
import {
  createAppSessionTokenPair,
  verifyAppSessionRefreshToken,
} from '@tuturuuu/auth/app-session';
import { resolveInternalAppSessionPolicy } from '@tuturuuu/auth/app-session-policy';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getConfirmedAuthEmail } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { extractIPFromRequest } from '@tuturuuu/utils/abuse-protection/edge';
import {
  type AppName,
  getAppDomainMap,
} from '@tuturuuu/utils/internal-domains';
import {
  readRequiredMfaPolicy,
  satisfiesRequiredMfaPolicy,
} from '@tuturuuu/utils/required-mfa-policy';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeRefreshTokenWithGrace } from '@/lib/app-coordination/refresh-replay';
import { getAppCoordinationSessionPolicy } from '@/lib/app-coordination/session-policy';
import {
  type ReportHandoffFailure,
  withAuthHandoffDiagnostics,
} from '@/lib/auth/handoff-diagnostics';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const REFRESH_REPLAY_KEY_PREFIX = 'app-session:refresh:used';
const ROUTE = '/api/v1/auth/cross-app-session/refresh';

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1).optional(),
  targetApp: z.string().trim().toLowerCase().min(1).max(64),
});

type RefreshVerificationResult =
  | {
      kind: 'verified';
      claims: Extract<
        ReturnType<typeof verifyAppSessionRefreshToken>,
        { ok: true }
      >['claims'];
    }
  | { kind: 'invalid' }
  | { kind: 'limited' }
  | { kind: 'unavailable' };

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

async function verifyRefreshToken({
  ip,
  refreshToken,
  replayGraceSeconds,
  targetApp,
}: {
  ip: string;
  refreshToken: string;
  replayGraceSeconds: number;
  targetApp: AppName;
}): Promise<RefreshVerificationResult> {
  const verification = verifyAppSessionRefreshToken(refreshToken, {
    targetApp,
  });

  if (!verification.ok) {
    return { kind: 'invalid' };
  }

  const consumeResult = await consumeRefreshTokenWithGrace({
    keyPrefix: REFRESH_REPLAY_KEY_PREFIX,
    onError: () => console.warn('App-session refresh replay check failed'),
    exp: verification.claims.exp,
    graceSeconds: replayGraceSeconds,
    ip,
    jti: verification.claims.jti,
    sub: verification.claims.sub,
  });

  switch (consumeResult) {
    case 'consumed':
    case 'grace':
      return { kind: 'verified', claims: verification.claims };
    case 'replayed':
    case 'revoked':
      return { kind: 'invalid' };
    case 'limited':
      return { kind: 'limited' };
    case 'unavailable':
      return { kind: 'unavailable' };
    default: {
      const exhaustive: never = consumeResult;
      return exhaustive;
    }
  }
}

async function refreshCrossAppSession(
  request: NextRequest,
  fail: ReportHandoffFailure
) {
  const body = await request.json().catch(() => null);
  const parsed = refreshSchema.safeParse(body);

  if (!parsed.success || !isRegisteredAppName(parsed.data.targetApp)) {
    return fail(
      'INVALID_REFRESH_PAYLOAD',
      jsonNoStore(
        { error: 'Invalid app-session refresh payload' },
        { status: 400 }
      )
    );
  }

  const { refreshToken, targetApp } = parsed.data;

  if (!refreshToken) {
    return fail(
      'MISSING_REFRESH_CREDENTIALS',
      jsonNoStore(
        { error: 'Missing app session refresh credentials' },
        { status: 401 }
      )
    );
  }

  if (
    requiresWorkerRedeemProof(targetApp) &&
    !verifyAppRedeemProof({
      targetApp,
      credential: refreshToken,
      proof: request.headers.get(APP_REDEEM_PROOF_HEADER),
    })
  ) {
    return fail(
      'REDEEM_PROOF_REQUIRED',
      jsonNoStore(
        { error: 'Invalid or expired app session refresh credentials' },
        { status: 401 }
      )
    );
  }

  const { policy } = await getAppCoordinationSessionPolicy();
  const verification = await verifyRefreshToken({
    ip: extractIPFromRequest(request.headers),
    refreshToken,
    replayGraceSeconds: policy.browserRefreshReplayGraceSeconds,
    targetApp,
  });

  switch (verification.kind) {
    case 'invalid':
      return fail(
        'INVALID_REFRESH_CREDENTIALS',
        jsonNoStore(
          { error: 'Invalid or expired app session refresh credentials' },
          { status: 401 }
        )
      );
    case 'limited':
      return fail(
        'REFRESH_RATE_LIMITED',
        jsonNoStore(
          { error: 'Too many refresh attempts' },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      );
    case 'unavailable':
      return fail(
        'APP_SESSION_REFRESH_UNAVAILABLE',
        jsonNoStore(
          {
            code: 'APP_SESSION_REFRESH_UNAVAILABLE',
            error: 'App session refresh temporarily unavailable',
          },
          { status: 503 }
        )
      );
    case 'verified':
      break;
    default: {
      const exhaustive: never = verification;
      return exhaustive;
    }
  }

  const sbAdmin = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const { data, error } = await sbAdmin.auth.admin.getUserById(
    verification.claims.sub
  );

  if (error || !data.user || data.user.id !== verification.claims.sub) {
    return fail(
      'REFRESH_SUBJECT_UNAVAILABLE',
      jsonNoStore(
        { error: 'Invalid or expired app session refresh credentials' },
        { status: 401 }
      )
    );
  }

  if (
    !satisfiesRequiredMfaPolicy(
      readRequiredMfaPolicy(data.user.app_metadata),
      verification.claims.mfa ?? null
    )
  ) {
    return fail(
      'MFA_REQUIRED',
      jsonNoStore(
        { code: 'MFA_REQUIRED', error: 'MFA verification required' },
        { status: 403 }
      )
    );
  }
  const internalAppSessionPolicy = resolveInternalAppSessionPolicy(
    policy,
    targetApp
  );
  const session = createAppSessionTokenPair(
    {
      email: getConfirmedAuthEmail(data.user),
      mfa: verification.claims.mfa,
      targetApp,
      userId: verification.claims.sub,
    },
    {
      policy: internalAppSessionPolicy,
    }
  );

  return jsonNoStore({
    mfa: verification.claims.mfa ?? null,
    appSessionExpiresAt: session.access.expiresAt,
    appSessionRefreshEarlySeconds: session.refreshEarlySeconds,
    appSessionRefreshExpiresAt: session.refresh.expiresAt,
    appSessionRefreshToken: session.refresh.token,
    appSessionToken: session.access.token,
    internalAppSessionPolicy,
    sessionData: {
      email: getConfirmedAuthEmail(data.user),
      mfa: verification.claims.mfa,
    },
    userId: verification.claims.sub,
    valid: true,
  });
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain({ request, route: ROUTE }, () =>
    withAuthHandoffDiagnostics(ROUTE, (fail) =>
      refreshCrossAppSession(request, fail)
    )
  );
}
