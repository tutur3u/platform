'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';

export interface UserGroupsParams {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface UserGroupsResponse {
  data: UserGroup[];
  count: number;
  error?: boolean;
  errorMessage?: string;
}

/**
 * Type for manager user data from workspace_users table.
 * Used when fetching group managers.
 */
export type ManagerUser = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  display_name: string | null;
  email: string | null;
};

export function useUserGroups(
  wsId: string,
  params: UserGroupsParams = {},
  options?: {
    enabled?: boolean;
    initialData?: UserGroupsResponse;
  }
) {
  const { q = '', page = 1, pageSize = 10 } = params;

  return useQuery({
    queryKey: ['workspace-user-groups', wsId, { q, page, pageSize }],
    queryFn: async (): Promise<UserGroupsResponse> => {
      const searchParams = new URLSearchParams();

      if (q) searchParams.set('q', q);
      searchParams.set('page', String(page));
      searchParams.set('pageSize', String(pageSize));

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/groups?${searchParams.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace user groups');
      }

      const json = (await response.json()) as UserGroupsResponse;
      if (json.error) {
        const errorMessage =
          json.errorMessage || 'Failed to fetch workspace user groups';
        throw new Error(errorMessage);
      }
      return json;
    },
    enabled: options?.enabled !== false,
    initialData: options?.initialData,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
