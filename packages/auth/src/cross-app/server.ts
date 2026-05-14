import { createClient } from '@tuturuuu/supabase/next/server';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { createAppSessionToken, setAppSessionCookie } from '../app-session';
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

type CrossAppSessionKind = 'app-session' | 'cli-app-session';

type CreatePostOptions = {
  appSessionScopes?: string[];
  sessionKind?: CrossAppSessionKind;
};

function getFirstRow(data: unknown): CrossAppTokenRow | null {
  const firstRow = Array.isArray(data) ? data[0] : data;

  if (!firstRow || typeof firstRow !== 'object') {
    return null;
  }

  return firstRow as CrossAppTokenRow;
}

function createAppSessionResponse(
  userId: string,
  appName: AppName,
  firstRow: CrossAppTokenRow,
  options: CreatePostOptions
) {
  const appSession = createAppSessionToken({
    email: firstRow.session_data?.email ?? null,
    scopes: options.appSessionScopes,
    targetApp: appName,
    userId,
  });
  const response = NextResponse.json({
    appSessionCreated: true,
    userId,
    valid: true,
  });

  setAppSessionCookie(response, appSession.token, {
    expires: new Date(appSession.claims.exp * 1000),
  });

  return response;
}

function createCliAppSessionResponse(
  userId: string,
  firstRow: CrossAppTokenRow
) {
  const cliSession = createCliAppSession({
    email: firstRow.session_data?.email ?? null,
    userId,
  });

  return NextResponse.json({
    ...createCliSessionResponseBody(cliSession),
    email: firstRow.session_data?.email ?? null,
    userId,
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
      const supabase = await createClient();
      const body = (await request.json()) as { token?: unknown };
      const token = typeof body.token === 'string' ? body.token : null;

      if (!token) {
        return NextResponse.json(
          { error: 'Missing required parameter: token' },
          { status: 400 }
        );
      }

      const { data, error } = await supabase.rpc(
        'validate_cross_app_token_with_session',
        {
          p_token: token,
          p_target_app: appName,
        }
      );

      if (error || !data) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      const firstRow = getFirstRow(data);
      const userId = firstRow?.user_id;

      if (!userId) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      if (options.sessionKind === 'cli-app-session') {
        if (appName !== CLI_APP_TARGET_APP) {
          return NextResponse.json(
            { error: 'Invalid CLI token target app' },
            { status: 500 }
          );
        }

        return createCliAppSessionResponse(userId, firstRow);
      }

      return createAppSessionResponse(userId, appName, firstRow, options);
    } catch {
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
