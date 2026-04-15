'use client';

import { useQuery } from '@tanstack/react-query';
import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import type { CurrentUserProfileResponse } from '@tuturuuu/internal-api/users';

export const currentUserProfileQueryKey = ['user', 'me'] as const;

export function useCurrentUserProfile(options?: { enabled?: boolean }) {
  return useQuery<CurrentUserProfileResponse | null>({
    queryKey: [...currentUserProfileQueryKey],
    queryFn: async () => {
      try {
        return await getCurrentUserProfile();
      } catch {
        return null;
      }
    },
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
