'use client';

import { useQuery } from '@tanstack/react-query';
import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { CurrentUserProfileResponse } from '@tuturuuu/internal-api/users';

export const currentUserProfileQueryKey = ['user', 'me'] as const;

export function useCurrentUserProfile(options?: {
  enabled?: boolean;
  userId?: string | null;
}) {
  return useQuery<CurrentUserProfileResponse | null>({
    queryKey: options?.userId
      ? [...currentUserProfileQueryKey, options.userId]
      : [...currentUserProfileQueryKey],
    queryFn: async () => {
      try {
        return await getCurrentUserProfile();
      } catch (error) {
        if (
          error instanceof InternalApiError &&
          (error.status === 401 || error.status === 404)
        ) {
          return null;
        }
        throw error;
      }
    },
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
