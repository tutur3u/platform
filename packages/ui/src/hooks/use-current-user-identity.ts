'use client';

import { useQuery } from '@tanstack/react-query';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';

export const CURRENT_USER_IDENTITY_QUERY_KEY = [
  'current-user-identity',
] as const;

export type CurrentUserIdentity = {
  id: string;
  email: string | null;
};

/**
 * Loads the signed-in user's id and email through the same-origin profile API,
 * so browser code never reads the session cookie itself. Resolves to `null`
 * when nobody is signed in or the profile cannot be loaded.
 */
export async function fetchCurrentUserIdentity(): Promise<CurrentUserIdentity | null> {
  try {
    const profile = await getCurrentUserProfile();
    return profile?.id
      ? { id: profile.id, email: profile.email ?? null }
      : null;
  } catch {
    return null;
  }
}

export function useCurrentUserIdentity() {
  return useQuery({
    queryKey: CURRENT_USER_IDENTITY_QUERY_KEY,
    queryFn: fetchCurrentUserIdentity,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
