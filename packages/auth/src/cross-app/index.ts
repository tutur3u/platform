import type { SupabaseClient } from '@tuturuuu/supabase/next/client';
import { Database } from '@tuturuuu/types/supabase';
import { APP_DOMAIN_MAP } from '@tuturuuu/utils/internal-domains';

export * from './navigation';

/**
 * Generates a cross-app authentication token for a user
 * @param supabase The Supabase client
 * @param targetApp The target app identifier (e.g., 'nova', 'mira', 'rewise')
 * @param originApp The origin app identifier (e.g., 'web')
 * @param expirySeconds Token expiry in seconds (default: 300 seconds / 5 minutes)
 * @returns The generated token or null if generation failed
 */
export async function generateCrossAppToken(
  supabase: SupabaseClient<Database, 'public', Database['public']>,
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

    // Call the RPC function to generate a token
    const { data, error } = await supabase.rpc('generate_cross_app_token', {
      p_user_id: user.id,
      p_origin_app: originApp,
      p_target_app: targetApp,
      p_expiry_seconds: expirySeconds,
    });

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
 * Validates a cross-app authentication token
 * @param supabase The Supabase client
 * @param token The token to validate
 * @param targetApp The target app identifier
 * @returns The user ID if the token is valid, null otherwise
 */
export async function validateCrossAppToken(
  supabase: SupabaseClient<Database>,
  token: string,
  targetApp: string
): Promise<string | null> {
  try {
    // Call the RPC function to validate the token
    const { data, error } = await supabase.rpc('validate_cross_app_token', {
      p_token: token,
      p_target_app: targetApp,
    });

    if (error) {
      console.error('Error validating cross-app token:', error);
      return null;
    }

    return data as string;
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
  supabase: SupabaseClient<Database>
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
  if (!token) {
    const nextUrl = searchParams.get('nextUrl');
    if (nextUrl) {
      router.push(nextUrl);
    } else {
      router.push('/');
    }
  } else {
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
    }

    const data = await res.json();
    if (data.userId) {
      // Token is valid, redirect to next url
      const nextUrl = searchParams.get('nextUrl');
      if (nextUrl) {
        router.push(nextUrl);
      } else {
        router.push('/');
      }
    }
  }
};
