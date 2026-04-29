import type { TypedSupabaseClient } from '../types';
import type { SupabaseUser } from './user';

export async function resolveAuthenticatedSessionUser(
  supabase: TypedSupabaseClient
): Promise<{ user: SupabaseUser | null; authError: unknown }> {
  try {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (!claimsError && typeof claimsData?.claims?.sub === 'string') {
      const claims = claimsData.claims as Record<string, unknown>;

      return {
        user: {
          id: claims.sub as string,
          aud:
            typeof claims.aud === 'string'
              ? claims.aud
              : Array.isArray(claims.aud)
                ? (claims.aud[0] ?? 'authenticated')
                : 'authenticated',
          role: typeof claims.role === 'string' ? claims.role : 'authenticated',
          email: typeof claims.email === 'string' ? claims.email : undefined,
          phone: typeof claims.phone === 'string' ? claims.phone : undefined,
          app_metadata:
            typeof claims.app_metadata === 'object' &&
            claims.app_metadata !== null &&
            !Array.isArray(claims.app_metadata)
              ? claims.app_metadata
              : {},
          user_metadata:
            typeof claims.user_metadata === 'object' &&
            claims.user_metadata !== null &&
            !Array.isArray(claims.user_metadata)
              ? claims.user_metadata
              : {},
          identities: [],
          created_at:
            typeof claims.iat === 'number'
              ? new Date(claims.iat * 1000).toISOString()
              : new Date(0).toISOString(),
          updated_at:
            typeof claims.iat === 'number'
              ? new Date(claims.iat * 1000).toISOString()
              : undefined,
          is_anonymous: false,
        } as SupabaseUser,
        authError: null,
      };
    }
  } catch {
    console.warn(
      '[resolveAuthenticatedSessionUser] getClaims is unavailable, falling back to getUser. This may be expected in testing environments or older Supabase clients.'
    );
    // Fall back to getUser when getClaims is unavailable in mocks/older clients.
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  return { user, authError };
}
