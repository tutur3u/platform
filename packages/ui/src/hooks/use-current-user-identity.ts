'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import { onSessionEnding } from '@tuturuuu/utils/session-events';
import { useEffect } from 'react';

export const CURRENT_USER_IDENTITY_QUERY_KEY = [
  'current-user-identity',
] as const;

const IDENTITY_STALE_TIME_MS = 30 * 1000;
const MAX_TRANSIENT_RETRIES = 2;

export type CurrentUserIdentity = {
  id: string;
  email: string | null;
};

function isSignedOutError(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 401 || status === 403;
}

/**
 * Loads the signed-in user's id and email through the same-origin profile API,
 * so browser code never reads the session cookie itself. Resolves to `null`
 * only when the server reports no signed-in user (401/403). Network errors,
 * rate limits and server errors reject, so callers can retry rather than
 * treat a transient failure as signed out.
 */
export async function fetchCurrentUserIdentity(): Promise<CurrentUserIdentity | null> {
  try {
    const profile = await getCurrentUserProfile();
    return profile?.id
      ? { id: profile.id, email: profile.email ?? null }
      : null;
  } catch (error) {
    if (isSignedOutError(error)) return null;
    throw error;
  }
}

export function shouldRetryIdentity(failureCount: number, error: unknown) {
  return !isSignedOutError(error) && failureCount < MAX_TRANSIENT_RETRIES;
}

/**
 * The signed-in user's identity as a TanStack Query. The cached value is
 * dropped when this tab announces a sign-out or account switch, and refetched
 * when a tab regains focus, so a session change in another tab is picked up.
 */
export function useCurrentUserIdentity() {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      onSessionEnding(() => {
        queryClient.removeQueries({
          queryKey: CURRENT_USER_IDENTITY_QUERY_KEY,
        });
      }),
    [queryClient]
  );

  return useQuery({
    queryKey: CURRENT_USER_IDENTITY_QUERY_KEY,
    queryFn: fetchCurrentUserIdentity,
    staleTime: IDENTITY_STALE_TIME_MS,
    retry: shouldRetryIdentity,
    refetchOnWindowFocus: true,
  });
}
