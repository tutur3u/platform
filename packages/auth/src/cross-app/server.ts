import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import {
  createAppSessionToken,
  setAppSessionCookie,
  setWebAppSessionCookie,
} from '../app-session';
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
  appSessionToken?: string | null;
  sessionData: CrossAppTokenRow['session_data'];
  userId: string;
};

type CrossAppSessionKind = 'app-session' | 'cli-app-session';

type CreatePostOptions = {
  appSessionScopes?: string[];
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
    appSessionToken?: unknown;
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
    appSessionToken:
      typeof body.appSessionToken === 'string' ? body.appSessionToken : null,
    sessionData: body.sessionData ?? null,
    userId: body.userId,
  };
}

function createAppSessionResponse(
  validation: CrossAppTokenValidation,
  appName: AppName,
  options: CreatePostOptions
) {
  const localAppSession = createAppSessionToken({
    email: validation.sessionData?.email ?? null,
    scopes: options.appSessionScopes,
    targetApp: appName,
    userId: validation.userId,
  });
  const webAppSessionExpiresAt = validation.appSessionExpiresAt
    ? new Date(validation.appSessionExpiresAt)
    : null;
  const hasValidWebAppSessionExpiry =
    webAppSessionExpiresAt && !Number.isNaN(webAppSessionExpiresAt.getTime());
  const localAppSessionExpiresAt = hasValidWebAppSessionExpiry
    ? webAppSessionExpiresAt
    : new Date(localAppSession.claims.exp * 1000);

  const response = NextResponse.json({
    appSessionCreated: true,
    userId: validation.userId,
    valid: true,
  });
  response.headers.set('Cache-Control', 'no-store');

  setAppSessionCookie(response, localAppSession.token, {
    expires: localAppSessionExpiresAt,
  });

  if (validation.appSessionToken && hasValidWebAppSessionExpiry) {
    setWebAppSessionCookie(response, validation.appSessionToken, {
      expires: webAppSessionExpiresAt,
    });
  }

  return response;
}

function createCliAppSessionResponse(validation: CrossAppTokenValidation) {
  const cliSession = createCliAppSession({
    email: validation.sessionData?.email ?? null,
    userId: validation.userId,
  });

  return jsonNoStore({
    ...createCliSessionResponseBody(cliSession),
    email: validation.sessionData?.email ?? null,
    userId: validation.userId,
  });
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

        return createCliAppSessionResponse(validation);
      }

      return createAppSessionResponse(validation, appName, options);
    } catch {
      return jsonNoStore({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
