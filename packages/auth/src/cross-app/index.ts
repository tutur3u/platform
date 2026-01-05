import {
  type TypedSupabaseClient,
  createClient,
} from '@ncthub/supabase/next/client';
import { APP_DOMAIN_MAP } from '@ncthub/utils/internal-domains';

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

    // Get the current session
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      console.error('Error getting session:', sessionError);
      return null;
    }

    // Extract the session tokens
    const sessionTokens = {
      access_token: sessionData.session?.access_token,
      refresh_token: sessionData.session?.refresh_token,
    };

    // Create parameters object with type assertion
    const params = {
      p_user_id: user.id,
      p_origin_app: originApp,
      p_target_app: targetApp,
      p_expiry_seconds: expirySeconds,
      p_session_data: sessionTokens,
    };

    // Call the RPC function to generate a token with session data
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
 * Validates a cross-app authentication token and returns the session data
 * @param supabase The Supabase client
 * @param token The token to validate
 * @param targetApp The target app identifier
 * @returns An object with userId and sessionData if valid, null otherwise
 */
export async function validateCrossAppTokenWithSession(
  supabase: TypedSupabaseClient,
  token: string,
  targetApp: string
): Promise<{
  userId: string;
  sessionData?: { access_token: string; refresh_token: string };
} | null> {
  try {
    // Call the RPC function to validate the token and get session data
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

    // Process the result
    const result = data as unknown as {
      user_id: string | null;
      session_data?: {
        access_token: string;
        refresh_token: string;
      };
    };

    if (!result.user_id) {
      return null;
    }

    // If session data is available, set the session
    if (result.session_data) {
      await supabase.auth.setSession({
        access_token: result.session_data.access_token,
        refresh_token: result.session_data.refresh_token,
      });
    }

    return {
      userId: result.user_id,
      sessionData: result.session_data,
    };
  } catch (error) {
    console.error(
      'Unexpected error validating cross-app token with session:',
      error
    );
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

  try {
    new URL(decodedUrl);
  } catch {
    console.error('Invalid URL format:', decodedUrl);
    return null;
  }

  const noTrailingSlash = decodedUrl.replace(/\/$/, '');
  const appIdentifier = APP_DOMAIN_MAP.find((domain) =>
    noTrailingSlash.startsWith(domain.url)
  )?.name;

  if (!appIdentifier) {
    console.warn('No app identifier found for URL:', noTrailingSlash);
  }

  return appIdentifier || null;
}

export const verifyRouteToken = async ({
  searchParams,
  token,
  router,
}: {
  searchParams: URLSearchParams;
  token: string | null;
  router: any;
}) => {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!token) {
    const nextUrl = searchParams.get('nextUrl');
    if (nextUrl) {
      router.push(nextUrl);
      router.refresh();
    } else {
      router.push('/');
      router.refresh();
    }
  } else {
    let userId = user?.id;

    if (!userId) {
      const res = await fetch('/api/auth/verify-app-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('Error verifying token:', data.error);
        router.push('/');
        router.refresh();
      }

      const data = await res.json();
      userId = data.userId;
    }

    if (userId) {
      // Token is valid, redirect to next url
      await supabase.auth.refreshSession();

      const nextUrl = searchParams.get('nextUrl');
      if (nextUrl) {
        router.push(nextUrl);
        router.refresh();
      } else {
        router.push('/');
        router.refresh();
      }
    }
  }
};
