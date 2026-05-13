import { createAppCoordinationToken } from '@tuturuuu/auth/app-coordination';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getAppDomainMap } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getAllowedAppTokenScopes,
  verifyExternalAppSecret,
} from '@/lib/app-coordination/external-apps';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

const DEFAULT_APP_TOKEN_TTL_SECONDS = 8 * 60 * 60;
const MAX_APP_TOKEN_TTL_SECONDS = 24 * 60 * 60;

const exchangeSchema = z.object({
  appId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,64}$/u)
    .optional(),
  appSecret: z.string().min(1).max(200).optional(),
  requestedScopes: z.array(z.string().min(1).max(80)).max(50).optional(),
  targetApp: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,64}$/u)
    .optional(),
  token: z.string().min(1),
});

type CrossAppValidationRow = {
  session_data?: {
    email?: unknown;
  } | null;
  user_id?: string | null;
};

function getValidationRow(value: unknown): CrossAppValidationRow | null {
  if (Array.isArray(value)) {
    return getValidationRow(value[0]);
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as CrossAppValidationRow;
}

function getConfiguredTokenTtlSeconds() {
  const configured = Number.parseInt(
    process.env.TUTURUUU_APP_COORDINATION_TOKEN_TTL_SECONDS ?? '',
    10
  );

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_APP_TOKEN_TTL_SECONDS;
  }

  return Math.min(configured, MAX_APP_TOKEN_TTL_SECONDS);
}

function isConfiguredApp(targetApp: string) {
  return getAppDomainMap().some((domain) => domain.name === targetApp);
}

async function resolveExchangeTarget({
  appId,
  appSecret,
  requestedScopes,
  targetApp,
}: {
  appId?: string;
  appSecret?: string;
  requestedScopes: string[];
  targetApp?: string;
}) {
  const resolvedTargetApp = targetApp ?? appId;

  if (!resolvedTargetApp) {
    return {
      error: 'Missing app coordination target',
      status: 400,
    } as const;
  }

  if (appId) {
    if (targetApp && targetApp !== appId) {
      return {
        error: 'App credential target mismatch',
        status: 400,
      } as const;
    }

    if (!appSecret) {
      return {
        error: 'Missing app secret',
        status: 401,
      } as const;
    }

    const verification = await verifyExternalAppSecret({ appId, appSecret });

    if (!verification.ok) {
      return {
        error: verification.error,
        status: 401,
      } as const;
    }

    return {
      scopes: getAllowedAppTokenScopes({
        allowedScopes: verification.app.allowedScopes,
        requestedScopes,
      }),
      targetApp: verification.app.id,
    } as const;
  }

  if (!isConfiguredApp(resolvedTargetApp)) {
    return {
      error: 'Unknown app coordination target',
      status: 400,
    } as const;
  }

  return {
    error: 'Missing app credentials',
    status: 401,
  } as const;
}

async function getUserEmail({
  sbAdmin,
  sessionData,
  userId,
}: {
  sbAdmin: TypedSupabaseClient;
  sessionData: CrossAppValidationRow['session_data'];
  userId: string;
}) {
  if (typeof sessionData?.email === 'string' && sessionData.email.trim()) {
    return sessionData.email.trim();
  }

  const { data, error } = await sbAdmin.auth.admin.getUserById(userId);

  if (error || !data.user?.email) {
    return null;
  }

  return data.user.email;
}

async function exchangeAppToken(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = exchangeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid app token exchange payload' },
      { status: 400 }
    );
  }

  const {
    appId,
    appSecret,
    requestedScopes = [],
    targetApp,
    token,
  } = parsed.data;
  let resolvedTarget: Awaited<ReturnType<typeof resolveExchangeTarget>>;

  try {
    resolvedTarget = await resolveExchangeTarget({
      appId,
      appSecret,
      requestedScopes,
      targetApp,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'app_scope_not_allowed') {
      return NextResponse.json(
        { error: 'Requested scope is not allowed for this app' },
        { status: 403 }
      );
    }

    throw error;
  }

  if ('error' in resolvedTarget) {
    return NextResponse.json(
      { error: resolvedTarget.error },
      { status: resolvedTarget.status }
    );
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const { data, error } = await supabase.rpc(
    'validate_cross_app_token_with_session',
    {
      p_target_app: resolvedTarget.targetApp,
      p_token: token,
    }
  );

  if (error) {
    serverLogger.warn('Failed to validate cross-app token for app exchange', {
      error: error.message,
      targetApp: resolvedTarget.targetApp,
    });
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }

  const validationRow = getValidationRow(data);
  const userId = validationRow?.user_id;

  if (!userId) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  const email = await getUserEmail({
    sbAdmin,
    sessionData: validationRow.session_data ?? null,
    userId,
  });
  const {
    claims,
    expiresAt,
    token: accessToken,
  } = createAppCoordinationToken({
    email,
    expiresInSeconds: getConfiguredTokenTtlSeconds(),
    originApp: 'web',
    scopes: resolvedTarget.scopes,
    targetApp: resolvedTarget.targetApp,
    userId,
  });

  return NextResponse.json({
    accessToken,
    app: {
      name: claims.target_app,
    },
    expiresAt,
    expiresIn: claims.exp - claims.iat,
    tokenType: 'Bearer',
    user: {
      email,
      id: userId,
    },
  });
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/auth/app-token/exchange',
    },
    () => exchangeAppToken(request)
  );
}
