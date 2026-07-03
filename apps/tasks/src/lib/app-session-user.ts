import {
  attachSupabaseAuthUser,
  createAppSessionUser,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { headers } from 'next/headers';
import { setLogDrainUserContext } from './infrastructure/log-drain';

type HeadersLike = {
  get(name: string): string | null;
};

type RequestLike = {
  headers: HeadersLike;
};

export type AppSessionUserResolution = {
  authError: Error | null;
  supabase: TypedSupabaseClient | null;
  user: SupabaseUser | null;
};

function isRequestLike(value: unknown): value is RequestLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'headers' in value &&
    typeof (value as RequestLike).headers?.get === 'function'
  );
}

async function getCurrentRequestHeaders() {
  try {
    return await headers();
  } catch {
    return null;
  }
}

export async function resolveAuthenticatedSessionUser(
  requestOrClient?: RequestLike | TypedSupabaseClient,
  providedSupabase?: TypedSupabaseClient
): Promise<AppSessionUserResolution> {
  const fallbackHeaders = isRequestLike(requestOrClient)
    ? null
    : await getCurrentRequestHeaders();
  const request = isRequestLike(requestOrClient)
    ? requestOrClient
    : fallbackHeaders
      ? { headers: fallbackHeaders }
      : null;

  if (!request) {
    return {
      authError: new Error('Missing app-session request headers'),
      supabase: null,
      user: null,
    };
  }

  const verification = verifyAppSessionRequest(
    request as Pick<Request, 'headers'>,
    {
      targetApp: ['platform', 'calendar', 'tasks'],
    }
  );

  if (!verification.ok) {
    return {
      authError: new Error(verification.error),
      supabase: null,
      user: null,
    };
  }

  const user = createAppSessionUser(verification.claims);
  const adminSupabase =
    providedSupabase ??
    (isRequestLike(requestOrClient) ? undefined : requestOrClient) ??
    ((await createAdminClient({
      noCookie: true,
    })) as TypedSupabaseClient);
  const supabase = attachSupabaseAuthUser(adminSupabase, user);

  setLogDrainUserContext({
    userEmail: user.email,
    userId: user.id,
  });

  return {
    authError: null,
    supabase,
    user,
  };
}
