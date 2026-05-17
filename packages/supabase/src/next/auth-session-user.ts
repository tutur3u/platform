import type { TypedSupabaseClient } from '../types';
import type { SupabaseUser } from './user';

const LogAuthTiming = process.env.NODE_ENV === 'development';

export async function resolveAuthenticatedSessionUser(
  supabase: TypedSupabaseClient
): Promise<{
  user: SupabaseUser | null;
  authError: (Error & { code?: string; status?: number }) | null;
}> {
  try {
    const t0 = LogAuthTiming ? Date.now() : 0;
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    const claimsMs = LogAuthTiming ? Date.now() - t0 : 0;

    if (!claimsError && typeof claimsData?.claims?.sub === 'string') {
      const claims = claimsData.claims as Record<string, unknown>;

      if (LogAuthTiming) {
        console.info(
          `[resolveAuthenticatedSessionUser] getClaims hit: ${claimsMs}ms — sub=${claimsData.claims.sub}`
        );
      }

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
          // JWT `iat` is token issue time, not account creation time. Leave
          // account age unknown unless a caller provides an explicit claim.
          created_at:
            typeof claims.created_at === 'string' ? claims.created_at : '',
          updated_at:
            typeof claims.updated_at === 'string'
              ? claims.updated_at
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
  }

  const t1 = LogAuthTiming ? Date.now() : 0;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const userMs = LogAuthTiming ? Date.now() - t1 : 0;

  if (LogAuthTiming) {
    console.info(
      `[resolveAuthenticatedSessionUser] getUser fallback: ${userMs}ms — sub=${user?.id ?? 'null'}`
    );
  }

  return { user, authError };
}
