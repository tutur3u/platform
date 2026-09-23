'use client';

import { useQuery } from '@tanstack/react-query';
import { getCurrentUserProfile } from '@tuturuuu/internal-api/users';
import { usePathname } from 'next/navigation';

/** Recheck on reconnect/resume without blocking optional accounts' cached UI.
 * The internal API routes MFA_REQUIRED through the server auth proxy. Offline
 * clients cannot discover a policy/recovery change until they reconnect.
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
    queryFn: () => getCurrentUserProfile(),
    enabled: protectedPage,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    throwOnError: false,
  });
  return null;
}
