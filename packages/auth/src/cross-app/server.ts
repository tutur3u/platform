import {
  createAdminClient,
  createClient,
  createDetachedClient,
} from '@tuturuuu/supabase/next/server';
import type { AppName } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { createAppSessionToken, setAppSessionCookie } from '../app-session';

type CrossAppTokenRow = {
  session_data?: {
    email?: string;
  } | null;
  user_id?: string | null;
};

type CrossAppSessionKind = 'app-session' | 'supabase';

type CreatePostOptions = {
  appSessionScopes?: string[];
  sessionKind?: CrossAppSessionKind;
  sessionMetadata?: Record<string, string>;
};

function getFirstRow(data: unknown): CrossAppTokenRow | null {
  const firstRow = Array.isArray(data) ? data[0] : data;

  if (!firstRow || typeof firstRow !== 'object') {
    return null;
  }

  return firstRow as CrossAppTokenRow;
}

function jsonValidWithoutSession(userId: string) {
  return NextResponse.json({
    sessionCreated: false,
    userId,
    valid: true,
  });
}

async function createSupabaseSessionResponse(
  userId: string,
  firstRow: CrossAppTokenRow,
  options: CreatePostOptions
) {
  try {
    const sbAdmin = await createAdminClient();
    const sessionData = firstRow.session_data ?? null;
    let userEmail = sessionData?.email;

    if (!userEmail) {
      const { data: userData, error: userError } =
        await sbAdmin.auth.admin.getUserById(userId);

      if (userError || !userData?.user?.email) {
        return jsonValidWithoutSession(userId);
      }

      userEmail = userData.user.email;
    }

    if (!userEmail) {
      return jsonValidWithoutSession(userId);
    }

    const { data: linkData, error: linkError } =
      await sbAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: userEmail,
        ...(options.sessionMetadata
          ? {
              options: {
                data: options.sessionMetadata,
              },
            }
          : {}),
      });

    if (linkError || !linkData) {
      return jsonValidWithoutSession(userId);
    }

    const magicLinkUrl = new URL(linkData.properties.action_link);
    const tokenHash = magicLinkUrl.searchParams.get('token');

    if (!tokenHash) {
      return jsonValidWithoutSession(userId);
    }

    const detached = createDetachedClient();
    const { data: otpData, error: verifyError } = await detached.auth.verifyOtp(
      {
        token_hash: tokenHash,
        type: 'magiclink',
      }
    );

    if (verifyError || !otpData.session) {
      return jsonValidWithoutSession(userId);
    }

    return NextResponse.json({
      userId,
      valid: true,
      sessionCreated: true,
      session: {
        access_token: otpData.session.access_token,
        refresh_token: otpData.session.refresh_token,
      },
    });
  } catch {
    return jsonValidWithoutSession(userId);
  }
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

/**
 * Creates a POST handler for cross-app token verification.
 *
 * Registered internal apps receive a Tuturuuu-managed app-session JWT cookie.
 * The CLI keeps its explicit Supabase session exchange by opting into
 * `sessionKind: 'supabase'`.
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

      if (options.sessionKind === 'supabase') {
        return createSupabaseSessionResponse(userId, firstRow, options);
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
