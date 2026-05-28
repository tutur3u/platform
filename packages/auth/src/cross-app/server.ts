import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import {
  createAppSessionTokenPair,
  getAppSessionRefreshTokenFromRequest,
  getAppSessionTokenFromRequest,
  getWebAppSessionRefreshTokenFromRequest,
  getWebAppSessionTokenFromRequest,
  setAppSessionCookie,
  setAppSessionRefreshCookie,
  setWebAppSessionCookie,
  setWebAppSessionRefreshCookie,
} from '../app-session';
import type { ResolvedInternalAppSessionPolicy } from '../app-session-policy';
import {
  CLI_APP_TARGET_APP,
  createCliAppSession,
  createCliSessionResponseBody,
} from '../cli-session';

type CrossAppTokenRow = {
  session_data?: {
    email?: string;
  } | null;
  user_id?: string | null;
};

type CrossAppTokenValidation = {
  appSessionExpiresAt?: string | null;
  appSessionRefreshEarlySeconds?: number | null;
  appSessionRefreshExpiresAt?: string | null;
  appSessionRefreshToken?: string | null;
  appSessionToken?: string | null;
  internalAppSessionPolicy?: ResolvedInternalAppSessionPolicy | null;
  sessionData: CrossAppTokenRow['session_data'];
  userId: string;
};

type CrossAppSessionKind = 'app-session' | 'cli-app-session';

type CliSessionPolicy = {
  cliAccessTtlSeconds: number;
  cliRefreshTtlSeconds: number;
};

type CreatePostOptions = {
  appSessionScopes?: string[];
  resolveCliSessionPolicy?: () => Promise<CliSessionPolicy> | CliSessionPolicy;
  sessionKind?: CrossAppSessionKind;
  verificationBaseUrl?: string;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function getFirstRow(data: unknown): CrossAppTokenRow | null {
  const firstRow = Array.isArray(data) ? data[0] : data;

  if (!firstRow || typeof firstRow !== 'object') {
    return null;
  }

  return firstRow as CrossAppTokenRow;
}

export async function validateCrossAppTokenWithClient({
  supabase,
  targetApp,
  token,
}: {
  supabase: TypedSupabaseClient;
  targetApp: AppName;
  token: string;
}): Promise<CrossAppTokenValidation | null> {
  const { data, error } = await supabase.rpc(
    'validate_cross_app_token_with_session',
    {
      p_token: token,
      p_target_app: targetApp,
    }
  );

  if (error || !data) {
    return null;
  }

  const firstRow = getFirstRow(data);
  const userId = firstRow?.user_id;

  if (!userId) {
    return null;
  }

  return {
    sessionData: firstRow.session_data ?? null,
    userId,
  };
}

async function validateCrossAppTokenWithCentralVerifier({
  baseUrl,
  targetApp,
  token,
}: {
  baseUrl: string;
  targetApp: AppName;
  token: string;
}): Promise<CrossAppTokenValidation | null> {
  const verificationUrl = new URL(
    '/api/v1/auth/cross-app-token/verify',
    baseUrl
  );
  const response = await fetch(verificationUrl, {
    body: JSON.stringify({ targetApp, token }),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    appSessionExpiresAt?: unknown;
    appSessionRefreshEarlySeconds?: unknown;
    appSessionRefreshExpiresAt?: unknown;
    appSessionRefreshToken?: unknown;
    appSessionToken?: unknown;
    internalAppSessionPolicy?: unknown;
    sessionData?: CrossAppTokenRow['session_data'];
    userId?: unknown;
  } | null;

  if (typeof body?.userId !== 'string') {
    return null;
  }

  return {
    appSessionExpiresAt:
      typeof body.appSessionExpiresAt === 'string'
        ? body.appSessionExpiresAt
        : null,
    appSessionRefreshEarlySeconds:
      typeof body.appSessionRefreshEarlySeconds === 'number'
        ? body.appSessionRefreshEarlySeconds
        : null,
    appSessionRefreshExpiresAt:
      typeof body.appSessionRefreshExpiresAt === 'string'
        ? body.appSessionRefreshExpiresAt
        : null,
    appSessionRefreshToken:
      typeof body.appSessionRefreshToken === 'string'
        ? body.appSessionRefreshToken
        : null,
    appSessionToken:
      typeof body.appSessionToken === 'string' ? body.appSessionToken : null,
    internalAppSessionPolicy: isInternalAppSessionPolicy(
      body.internalAppSessionPolicy
    )
      ? body.internalAppSessionPolicy
      : null,
    sessionData: body.sessionData ?? null,
    userId: body.userId,
  };
}

async function refreshAppSessionWithCentralVerifier({
  accessToken,
  baseUrl,
  refreshToken,
  targetApp,
}: {
  accessToken?: string | null;
  baseUrl: string;
  refreshToken?: string | null;
  targetApp: AppName;
}): Promise<CrossAppTokenValidation | null> {
  const refreshUrl = new URL('/api/v1/auth/cross-app-session/refresh', baseUrl);
  const response = await fetch(refreshUrl, {
    body: JSON.stringify({ accessToken, refreshToken, targetApp }),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    appSessionExpiresAt?: unknown;
    appSessionRefreshEarlySeconds?: unknown;
    appSessionRefreshExpiresAt?: unknown;
    appSessionRefreshToken?: unknown;
    appSessionToken?: unknown;
    internalAppSessionPolicy?: unknown;
    sessionData?: CrossAppTokenRow['session_data'];
    userId?: unknown;
  } | null;

  if (typeof body?.userId !== 'string') {
    return null;
  }

  return {
    appSessionExpiresAt:
      typeof body.appSessionExpiresAt === 'string'
        ? body.appSessionExpiresAt
        : null,
    appSessionRefreshEarlySeconds:
      typeof body.appSessionRefreshEarlySeconds === 'number'
        ? body.appSessionRefreshEarlySeconds
        : null,
    appSessionRefreshExpiresAt:
      typeof body.appSessionRefreshExpiresAt === 'string'
        ? body.appSessionRefreshExpiresAt
        : null,
    appSessionRefreshToken:
      typeof body.appSessionRefreshToken === 'string'
        ? body.appSessionRefreshToken
        : null,
    appSessionToken:
      typeof body.appSessionToken === 'string' ? body.appSessionToken : null,
    internalAppSessionPolicy: isInternalAppSessionPolicy(
      body.internalAppSessionPolicy
    )
      ? body.internalAppSessionPolicy
      : null,
    sessionData: body.sessionData ?? null,
    userId: body.userId,
  };
}

function isInternalAppSessionPolicy(
  value: unknown
): value is ResolvedInternalAppSessionPolicy {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const policy = value as Partial<ResolvedInternalAppSessionPolicy>;

  return (
    typeof policy.internalAppAccessTtlSeconds === 'number' &&
    typeof policy.internalAppRefreshEarlySeconds === 'number' &&
    typeof policy.internalAppRefreshTtlSeconds === 'number'
  );
}

function createAppSessionResponse(
  validation: CrossAppTokenValidation,
  appName: AppName,
  options: CreatePostOptions
) {
  const localAppSession = createAppSessionTokenPair(
    {
      email: validation.sessionData?.email ?? null,
      originApp: 'web',
      scopes: options.appSessionScopes,
      targetApp: appName,
      userId: validation.userId,
    },
    {
      policy: validation.internalAppSessionPolicy ?? undefined,
    }
  );
  const webAppSessionExpiresAt = validation.appSessionExpiresAt
    ? new Date(validation.appSessionExpiresAt)
    : null;
  const webAppSessionRefreshExpiresAt = validation.appSessionRefreshExpiresAt
    ? new Date(validation.appSessionRefreshExpiresAt)
    : null;
  const hasValidWebAppSessionExpiry =
    webAppSessionExpiresAt && !Number.isNaN(webAppSessionExpiresAt.getTime());
  const hasValidWebAppSessionRefreshExpiry =
    webAppSessionRefreshExpiresAt &&
    !Number.isNaN(webAppSessionRefreshExpiresAt.getTime());
  const localAppSessionExpiresAt = new Date(
    localAppSession.access.claims.exp * 1000
  );
  const localAppSessionRefreshExpiresAt = new Date(
    localAppSession.refresh.claims.exp * 1000
  );

  const response = NextResponse.json({
    appSessionCreated: true,
    appSessionRefreshEarlySeconds:
      validation.appSessionRefreshEarlySeconds ??
      localAppSession.refreshEarlySeconds,
    userId: validation.userId,
    valid: true,
  });
  response.headers.set('Cache-Control', 'no-store');

  setAppSessionCookie(response, localAppSession.access.token, {
    expires: localAppSessionExpiresAt,
  });
  setAppSessionRefreshCookie(response, localAppSession.refresh.token, {
    expires: localAppSessionRefreshExpiresAt,
  });

  if (validation.appSessionToken && hasValidWebAppSessionExpiry) {
    setWebAppSessionCookie(response, validation.appSessionToken, {
      expires: webAppSessionExpiresAt,
    });
  }

  if (validation.appSessionRefreshToken && hasValidWebAppSessionRefreshExpiry) {
    setWebAppSessionRefreshCookie(response, validation.appSessionRefreshToken, {
      expires: webAppSessionRefreshExpiresAt,
    });
  }

  return response;
}

async function createCliAppSessionResponse(
  validation: CrossAppTokenValidation,
  options: CreatePostOptions
) {
  const policy = await options.resolveCliSessionPolicy?.();
  const cliSession = createCliAppSession({
    accessExpiresInSeconds: policy?.cliAccessTtlSeconds,
    email: validation.sessionData?.email ?? null,
    refreshExpiresInSeconds: policy?.cliRefreshTtlSeconds,
    userId: validation.userId,
  });

  return jsonNoStore({
    ...createCliSessionResponseBody(cliSession),
    email: validation.sessionData?.email ?? null,
    userId: validation.userId,
  });
}

export function createRefreshPOST(
  appName: AppName,
  options: CreatePostOptions = {}
) {
  return async function POST(request: NextRequest) {
    if (!options.verificationBaseUrl) {
      return jsonNoStore(
        { error: 'Central verification URL is not configured' },
        { status: 500 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      accessToken?: unknown;
      refreshToken?: unknown;
    } | null;
    const accessToken =
      typeof body?.accessToken === 'string'
        ? body.accessToken
        : (getWebAppSessionTokenFromRequest(request) ??
          getAppSessionTokenFromRequest(request));
    const refreshToken =
      typeof body?.refreshToken === 'string'
        ? body.refreshToken
        : (getWebAppSessionRefreshTokenFromRequest(request) ??
          getAppSessionRefreshTokenFromRequest(request));

    if (!accessToken && !refreshToken) {
      return jsonNoStore(
        { error: 'Missing app session refresh credentials' },
        { status: 401 }
      );
    }

    const validation = await refreshAppSessionWithCentralVerifier({
      accessToken,
      baseUrl: options.verificationBaseUrl,
      refreshToken,
      targetApp: appName,
    });

    if (!validation) {
      return jsonNoStore(
        { error: 'Invalid or expired app session refresh credentials' },
        { status: 401 }
      );
    }

    return createAppSessionResponse(validation, appName, options);
  };
}

/**
 * Creates a POST handler for cross-app token verification.
 *
 * Registered internal apps receive a Tuturuuu-managed app-session JWT cookie.
 * The CLI receives explicit Tuturuuu-managed access and refresh JWTs by opting
 * into `sessionKind: 'cli-app-session'`.
 *
 * @param appName The name of the target app (e.g., 'nova', 'rewise', 'platform')
 */
export function createPOST(appName: AppName, options: CreatePostOptions = {}) {
  return async function POST(request: NextRequest) {
    try {
      const body = (await request.json()) as { token?: unknown };
      const token = typeof body.token === 'string' ? body.token : null;

      if (!token) {
        return jsonNoStore(
          { error: 'Missing required parameter: token' },
          { status: 400 }
        );
      }

      const validation = options.verificationBaseUrl
        ? await validateCrossAppTokenWithCentralVerifier({
            baseUrl: options.verificationBaseUrl,
            targetApp: appName,
            token,
          })
        : await validateCrossAppTokenWithClient({
            supabase: (await createClient()) as TypedSupabaseClient,
            targetApp: appName,
            token,
          });

      if (!validation) {
        return jsonNoStore(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      if (options.sessionKind === 'cli-app-session') {
        if (appName !== CLI_APP_TARGET_APP) {
          return jsonNoStore(
            { error: 'Invalid CLI token target app' },
            { status: 500 }
          );
        }

        return createCliAppSessionResponse(validation, options);
      }

      return createAppSessionResponse(validation, appName, options);
    } catch {
      return jsonNoStore({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
