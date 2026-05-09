import {
  createClient,
  type TypedSupabaseClient,
} from '@tuturuuu/supabase/next/client';
import { APP_DOMAIN_MAP } from '@tuturuuu/utils/internal-domains';
import type { useRouter } from 'next/navigation';

export * from './navigation';

/**
 * Generates a cross-app authentication token for a user
 * @param supabase The Supabase client
 * @param targetApp The target app identifier (e.g., 'nova', 'rewise')
 * @param originApp The origin app identifier (e.g., 'web')
 * @param expirySeconds Token expiry in seconds (default: 300 seconds / 5 minutes)
 * @returns The generated token or null if generation failed
 */
export async function generateCrossAppToken(
  supabase: TypedSupabaseClient,
  targetApp: string,
  originApp: string,
  expirySeconds: number = 300
): Promise<string | null> {
  try {
    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error getting user:', userError);
      return null;
    }

    // Pass the user's email through session_data so the target app can skip
    // the getUserById admin API call. We do NOT pass refresh tokens because
    // Supabase uses refresh token rotation — sharing a token between apps
    // causes whichever refreshes first to invalidate the other's session.
    const sessionData = user.email ? { email: user.email } : null;

    const params = {
      p_user_id: user.id,
      p_origin_app: originApp,
      p_target_app: targetApp,
      p_expiry_seconds: expirySeconds,
      p_session_data: sessionData,
    };

    // Call the RPC function to generate a token
    const { data, error } = await supabase.rpc(
      'generate_cross_app_token',
      params
    );

    if (error) {
      console.error('Error generating cross-app token:', error);
      return null;
    }

    return data as string;
  } catch (error) {
    console.error('Unexpected error generating cross-app token:', error);
    return null;
  }
}

/**
 * Validates a cross-app authentication token and returns the user ID
 * @param supabase The Supabase client
 * @param token The token to validate
 * @param targetApp The target app identifier
 * @returns An object with userId if valid, null otherwise
 * @deprecated Use validateCrossAppToken instead - session data is no longer copied
 */
export async function validateCrossAppTokenWithSession(
  supabase: TypedSupabaseClient,
  token: string,
  targetApp: string
): Promise<{
  userId: string;
  sessionData?: { access_token: string; refresh_token: string };
} | null> {
  const result = await validateCrossAppToken(supabase, token, targetApp);
  if (!result) return null;
  return { userId: result.userId };
}

/**
 * Validates a cross-app authentication token and returns the user ID
 * The target app should create its own session using this user ID
 * @param supabase The Supabase client
 * @param token The token to validate
 * @param targetApp The target app identifier
 * @returns An object with userId if valid, null otherwise
 */
export async function validateCrossAppToken(
  supabase: TypedSupabaseClient,
  token: string,
  targetApp: string
): Promise<{ userId: string } | null> {
  try {
    // Call the RPC function to validate the token
    const { data, error } = await supabase.rpc(
      'validate_cross_app_token_with_session',
      {
        p_token: token,
        p_target_app: targetApp,
      }
    );

    if (error || !data) {
      console.error('Error validating cross-app token:', error);
      return null;
    }

    // Process the result — only extract user_id
    const result = data as unknown as {
      user_id: string | null;
    };

    if (!result.user_id) {
      return null;
    }

    return {
      userId: result.user_id,
    };
  } catch (error) {
    console.error('Unexpected error validating cross-app token:', error);
    return null;
  }
}

/**
 * Revokes all cross-app tokens for the current user
 * @param supabase The Supabase client
 * @returns True if successful, false otherwise
 */
export async function revokeAllCrossAppTokens(
  supabase: TypedSupabaseClient
): Promise<boolean> {
  try {
    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Error getting user:', userError);
      return false;
    }

    // Call the RPC function to revoke all tokens
    const { error } = await supabase.rpc('revoke_all_cross_app_tokens', {
      p_user_id: user.id,
    });

    if (error) {
      console.error('Error revoking cross-app tokens:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Unexpected error revoking cross-app tokens:', error);
    return false;
  }
}

/**
 * Maps the provided URL to the corresponding app identifier
 * @param url The URL to map
 * @returns The app identifier or null if not found
 */
export function mapUrlToApp(url: string): string | null {
  const decodedUrl = decodeURIComponent(url);
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(decodedUrl);
  } catch {
    console.error('Invalid URL format:', decodedUrl);
    return null;
  }

  const appIdentifier = APP_DOMAIN_MAP.find(
    (domain) => new URL(domain.url).origin === parsedUrl.origin
  )?.name;

  if (!appIdentifier) {
    console.warn('No app identifier found for URL:', parsedUrl.origin);
  }

  return appIdentifier || null;
}

async function readVerificationError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;

    if (typeof body?.error === 'string') {
      return body.error;
    }
  }

  const text = await response.text().catch(() => '');

  return (
    text ||
    `Token verification failed with status ${response.status.toString()}`
  );
}

function redirectAfterVerificationFailure(
  router: ReturnType<typeof useRouter>
) {
  router.push('/');
  router.refresh();
}

export const verifyRouteToken = async ({
  searchParams,
  token,
  router,
}: {
  searchParams: URLSearchParams;
  token: string | null;
  router: ReturnType<typeof useRouter>;
}) => {
  try {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!token) {
      const nextUrl = searchParams.get('nextUrl');
      router.push(nextUrl || '/');
      router.refresh();
      return;
    }

    // Always verify the token when present — it represents fresh auth from web
    // and should override any existing (potentially stale aal1) session
    let userId = user?.id;

    const res = await fetch('/api/auth/verify-app-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      console.error('Error verifying token:', await readVerificationError(res));
      redirectAfterVerificationFailure(router);
      return;
    }

    const data = await res.json();
    userId = data.userId;

    if (!userId) {
      console.error('Error verifying token: missing user id');
      redirectAfterVerificationFailure(router);
      return;
    }

    // The server creates an independent session for this satellite app via
    // generateLink + verifyOtp. The tokens are returned in the response body
    // (no Set-Cookie headers) so the browser client stores them in its own
    // domain-scoped cookies, avoiding cross-app cookie collisions.
    if (data.session?.access_token && data.session?.refresh_token) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError) {
        console.error(
          '[cross-app] setSession failed, trying refreshSession:',
          sessionError
        );
        // setSession can fail if the tokens expired during transit.
        // Fall back to refreshing whatever session the middleware may have set.
        await supabase.auth.refreshSession();
      }
    } else {
      // No session tokens in response — server couldn't create a session.
      // Try to refresh whatever session the middleware established.
      await supabase.auth.refreshSession();
    }

    const nextUrl = searchParams.get('nextUrl');
    router.push(nextUrl || '/');
    router.refresh();
  } catch (error) {
    console.error('[cross-app] Unexpected token verification error:', error);
    redirectAfterVerificationFailure(router);
  }
};
