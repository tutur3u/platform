import { createAppSessionTokenPair } from '@tuturuuu/auth/app-session';
import { resolveInternalAppSessionPolicy } from '@tuturuuu/auth/app-session-policy';
import { validateCrossAppTokenWithClient } from '@tuturuuu/auth/cross-app/server';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type AppName,
  getAppDomainMap,
} from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppCoordinationSessionPolicy } from '@/lib/app-coordination/session-policy';
import {
  type ReportHandoffFailure,
  withAuthHandoffDiagnostics,
} from '@/lib/auth/handoff-diagnostics';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const ROUTE = '/api/v1/auth/cross-app-token/verify';

const verifyCrossAppTokenSchema = z.object({
  targetApp: z.string().min(1).max(64),
  token: z.string().min(1),
});

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

async function verifyCrossAppToken(
  request: NextRequest,
  fail: ReportHandoffFailure
) {
  const body = await request.json().catch(() => null);
  const parsed = verifyCrossAppTokenSchema.safeParse(body);

  if (!parsed.success || !isRegisteredAppName(parsed.data.targetApp)) {
    return fail(
      'INVALID_VERIFICATION_PAYLOAD',
      jsonNoStore(
        { error: 'Invalid cross-app token verification payload' },
        { status: 400 }
      )
    );
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const validation = await validateCrossAppTokenWithClient({
    supabase,
    targetApp: parsed.data.targetApp,
    token: parsed.data.token,
  });

  if (!validation) {
    return fail(
      'TOKEN_VERIFICATION_FAILED',
      jsonNoStore({ error: 'Invalid or expired token' }, { status: 401 })
    );
  }

  const { policy } = await getAppCoordinationSessionPolicy();
  const internalAppSessionPolicy = resolveInternalAppSessionPolicy(
    policy,
    parsed.data.targetApp
  );
  const appSession = createAppSessionTokenPair(
    {
      email: validation.sessionData?.email ?? null,
      mfa: validation.mfa ?? undefined,
      targetApp: parsed.data.targetApp,
      userId: validation.userId,
    },
    {
      policy: internalAppSessionPolicy,
    }
  );

  return jsonNoStore({
    mfa: validation.mfa ?? null,
    appSessionExpiresAt: appSession.access.expiresAt,
    appSessionRefreshEarlySeconds: appSession.refreshEarlySeconds,
    appSessionRefreshExpiresAt: appSession.refresh.expiresAt,
    appSessionRefreshToken: appSession.refresh.token,
    appSessionToken: appSession.access.token,
    internalAppSessionPolicy,
    sessionData: validation.sessionData,
    userId: validation.userId,
    valid: true,
  });
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain({ request, route: ROUTE }, () =>
    withAuthHandoffDiagnostics(ROUTE, (fail) =>
      verifyCrossAppToken(request, fail)
    )
  );
}
