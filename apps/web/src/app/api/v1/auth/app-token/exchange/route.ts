import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { getAppDomainMap } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/common';
import {
  getAllowedAppTokenScopes,
  verifyExternalAppSecret,
} from '@/lib/app-coordination/external-apps';
import { getAppCoordinationSessionPolicy } from '@/lib/app-coordination/session-policy';
import { authorizeExternalProjectAppTokenExchange } from '@/lib/external-projects/access';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

const APP_TOKEN_REFRESH_SCOPE = 'app-token:refresh';

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
  refreshToken: z.string().min(1).optional(),
  token: z.string().min(1).optional(),
  workspaceId: z.string().trim().max(128).optional(),
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

function buildInvitationUrl(request: NextRequest, workspaceId: string) {
  const path = `/${encodeURIComponent(workspaceId)}`;

  for (const baseUrl of [BASE_URL, request.nextUrl.origin]) {
    try {
      return new URL(path, baseUrl).toString();
    } catch {}
  }

  return path;
}

async function createExchangeTokenResponse({
  email,
  normalizedWorkspaceId,
  scopes,
  targetApp,
  userId,
}: {
  email: string | null;
  normalizedWorkspaceId?: string | null;
  scopes: string[];
  targetApp: string;
  userId: string;
}) {
  const { policy } = await getAppCoordinationSessionPolicy();
  const accessToken = createAppCoordinationToken({
    email,
    expiresInSeconds: policy.externalAppBearerTtlSeconds,
    originApp: 'web',
    scopes,
    targetApp,
    userId,
  });
  const refreshToken = createAppCoordinationToken({
    email,
    expiresInSeconds: policy.internalAppRefreshTtlSeconds,
    originApp: 'web',
    scopes: [APP_TOKEN_REFRESH_SCOPE],
    targetApp,
    userId,
  });

  return NextResponse.json({
    accessToken: accessToken.token,
    app: {
      name: accessToken.claims.target_app,
    },
    expiresAt: accessToken.expiresAt,
    expiresIn: accessToken.claims.exp - accessToken.claims.iat,
    refreshEarlySeconds: policy.internalAppRefreshEarlySeconds,
    refreshExpiresAt: refreshToken.expiresAt,
    refreshExpiresIn: refreshToken.claims.exp - refreshToken.claims.iat,
    refreshToken: refreshToken.token,
    tokenType: 'Bearer',
    user: {
      email,
      id: userId,
    },
    workspaceId: normalizedWorkspaceId,
  });
}

function verifyExchangeRefreshToken({
  refreshToken,
  targetApp,
}: {
  refreshToken: string;
  targetApp: string;
}) {
  let verification: ReturnType<typeof verifyAppCoordinationToken>;

  try {
    verification = verifyAppCoordinationToken(refreshToken);
  } catch {
    return null;
  }

  if (!verification.ok) {
    return null;
  }

  const { claims } = verification;

  if (
    claims.target_app !== targetApp ||
    !claims.scopes.includes(APP_TOKEN_REFRESH_SCOPE)
  ) {
    return null;
  }

  return claims;
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
    refreshToken,
    requestedScopes = [],
    targetApp,
    token,
    workspaceId,
  } = parsed.data;

  if (Boolean(token) === Boolean(refreshToken)) {
    return NextResponse.json(
      { error: 'Provide exactly one token or refresh token' },
      { status: 400 }
    );
  }

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

  const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
  let email: string | null;
  let userId: string;

  if (refreshToken) {
    const refreshClaims = verifyExchangeRefreshToken({
      refreshToken,
      targetApp: resolvedTarget.targetApp,
    });

    if (!refreshClaims) {
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    userId = refreshClaims.sub;
    email = await getUserEmail({
      sbAdmin,
      sessionData: null,
      userId,
    });
  } else {
    const crossAppToken = token;

    if (!crossAppToken) {
      return NextResponse.json(
        { error: 'Provide exactly one token or refresh token' },
        { status: 400 }
      );
    }

    const supabase = (await createClient(request)) as TypedSupabaseClient;
    const { data, error } = await supabase.rpc(
      'validate_cross_app_token_with_session',
      {
        p_target_app: resolvedTarget.targetApp,
        p_token: crossAppToken,
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
    userId = validationRow?.user_id ?? '';

    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    email = await getUserEmail({
      sbAdmin,
      sessionData: validationRow?.session_data ?? null,
      userId,
    });
  }

  const exchangeAuthorization = await authorizeExternalProjectAppTokenExchange({
    admin: sbAdmin,
    appId: resolvedTarget.targetApp,
    authEmail: email,
    scopes: resolvedTarget.scopes,
    userId,
    workspaceId,
  });

  if (!exchangeAuthorization.ok) {
    if (exchangeAuthorization.code === 'PENDING_WORKSPACE_INVITE') {
      const normalizedWorkspaceId = exchangeAuthorization.normalizedWorkspaceId;
      return NextResponse.json(
        {
          code: 'PENDING_WORKSPACE_INVITE',
          error: exchangeAuthorization.error,
          invitationUrl: buildInvitationUrl(
            request,
            normalizedWorkspaceId ?? workspaceId ?? ''
          ),
          workspaceId: normalizedWorkspaceId ?? workspaceId ?? null,
        },
        { status: exchangeAuthorization.status }
      );
    }

    return NextResponse.json(
      { error: exchangeAuthorization.error },
      { status: exchangeAuthorization.status }
    );
  }

  return createExchangeTokenResponse({
    email,
    normalizedWorkspaceId: exchangeAuthorization.normalizedWorkspaceId,
    scopes: resolvedTarget.scopes,
    targetApp: resolvedTarget.targetApp,
    userId,
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
