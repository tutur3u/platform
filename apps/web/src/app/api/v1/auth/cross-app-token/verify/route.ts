import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { validateCrossAppTokenWithClient } from '@tuturuuu/auth/cross-app/server';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type AppName,
  getAppDomainMap,
} from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

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

async function verifyCrossAppToken(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = verifyCrossAppTokenSchema.safeParse(body);

  if (!parsed.success || !isRegisteredAppName(parsed.data.targetApp)) {
    return jsonNoStore(
      { error: 'Invalid cross-app token verification payload' },
      { status: 400 }
    );
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const validation = await validateCrossAppTokenWithClient({
    supabase,
    targetApp: parsed.data.targetApp,
    token: parsed.data.token,
  });

  if (!validation) {
    return jsonNoStore({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const appSession = createAppSessionToken({
    email: validation.sessionData?.email ?? null,
    targetApp: parsed.data.targetApp,
    userId: validation.userId,
  });

  return jsonNoStore({
    appSessionExpiresAt: new Date(appSession.claims.exp * 1000).toISOString(),
    appSessionToken: appSession.token,
    sessionData: validation.sessionData,
    userId: validation.userId,
    valid: true,
  });
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/auth/cross-app-token/verify',
    },
    () => verifyCrossAppToken(request)
  );
}
