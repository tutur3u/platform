import type { TypedSupabaseClient } from '../types';
import type { SupabaseUser } from './user';

export type SessionUserCheckOptions = {
  readonly check: () => void;
};

const LogAuthTiming = process.env.NODE_ENV === 'development';

export async function resolveAuthenticatedSessionUser(
  supabase: TypedSupabaseClient,
  options?: SessionUserCheckOptions
): Promise<{
  user: SupabaseUser | null;
  authError: (Error & { code?: string; status?: number }) | null;
}> {
  if (options) {
    options.check();
    if (typeof supabase.auth.getClaims === 'function') {
      try {
        // Claims are optional and never authorize the returned identity.
        await supabase.auth.getClaims();
      } catch {
        // A current stop must escape this optional-claims fallback.
        options.check();
      }
      options.check();
    }

    options.check();
    let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
    try {
      result = await supabase.auth.getUser();
    } catch (error) {
      options.check();
      throw error;
    }
    options.check();
    const {
      data: { user },
      error: authError,
    } = result;
    return { user, authError };
  }

  try {
    if (typeof supabase.auth.getClaims === 'function') {
      const t0 = LogAuthTiming ? Date.now() : 0;
      const { data: claimsData, error: claimsError } =
        await supabase.auth.getClaims();
      const claimsMs = LogAuthTiming ? Date.now() - t0 : 0;

      if (!claimsError && typeof claimsData?.claims?.sub === 'string') {
        if (LogAuthTiming) {
          console.info(
            `[resolveAuthenticatedSessionUser] getClaims hit: ${claimsMs}ms - sub=${claimsData.claims.sub}`
          );
        }
      }
    }
  } catch {
    console.warn(
      '[resolveAuthenticatedSessionUser] getClaims is unavailable, falling back to getUser. This may be expected in testing environments or older Supabase clients.'
    );
  }

  // Auth server state is the source of truth for revocation and account status.
  const t1 = LogAuthTiming ? Date.now() : 0;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const userMs = LogAuthTiming ? Date.now() - t1 : 0;

  if (LogAuthTiming) {
    console.info(
      `[resolveAuthenticatedSessionUser] getUser revalidation: ${userMs}ms - sub=${user?.id ?? 'null'}`
    );
  }

  return { user, authError };
}
