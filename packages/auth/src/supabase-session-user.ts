import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';

type RequestLike = Pick<Request, 'headers'> & Partial<Pick<Request, 'url'>>;

export type SupabaseSessionResolution = {
  authError: Error | null;
  supabase: TypedSupabaseClient | null;
  user: SupabaseUser | null;
};

export async function resolveSupabaseSessionRequest(
  request?: RequestLike,
  providedSupabase?: TypedSupabaseClient
): Promise<SupabaseSessionResolution> {
  try {
    const { createClient } = await import('@tuturuuu/supabase/next/server');
    const supabase =
      providedSupabase ??
      ((await createClient(request)) as TypedSupabaseClient);
    const { authError, user } = await resolveAuthenticatedSessionUser(supabase);

    return { authError, supabase, user };
  } catch (error) {
    return {
      authError: error instanceof Error ? error : new Error(String(error)),
      supabase: null,
      user: null,
    };
  }
}

export async function getSupabaseSessionUser(): Promise<SupabaseUser | null> {
  return (await resolveSupabaseSessionRequest()).user;
}
