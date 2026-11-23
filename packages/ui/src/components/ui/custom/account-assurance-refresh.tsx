'use client';

import { useQuery } from '@tanstack/react-query';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import { usePathname } from 'next/navigation';

const ACCOUNT_ASSURANCE_RECHECK_MS = 60_000;

/** Recheck on reconnect/resume without blocking optional accounts' cached UI.
 * The internal API routes MFA_REQUIRED through the server auth proxy. Offline
 * clients cannot discover a policy/recovery change until they reconnect.
 * Focus and reconnect always recheck; a remount within the stale window (the
 * lazy dashboard shell remounts this several times while loading) reuses the
 * last check instead of adding another profile read to the users/me budget.
 * Only the outcome is cached, never the profile.
 */
export function AccountAssuranceRefresh() {
  const pathname = usePathname();
  const protectedPage = Boolean(
    pathname &&
    !/^\/(?:en|vi)?\/?$/.test(pathname) &&
    !/(?:^|\/)(?:login|verify-token|auth)(?:\/|$)/.test(pathname)
  );
  useQuery({
    queryKey: ['account-assurance-refresh'],
    queryFn: async () => {
      await getCurrentUserProfile();
      return true;
    },
    enabled: protectedPage,
    staleTime: ACCOUNT_ASSURANCE_RECHECK_MS,
    gcTime: 5 * ACCOUNT_ASSURANCE_RECHECK_MS,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    throwOnError: false,
  });
  return null;
}
