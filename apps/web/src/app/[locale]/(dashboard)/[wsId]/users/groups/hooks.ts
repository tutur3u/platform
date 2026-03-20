'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
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

interface UserGroupsPageResponse extends UserGroupsResponse {
  page: number;
  pageSize: number;
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
  hasLinkedPlatformUser: boolean;
};

const GROUPS_INFINITE_PAGE_SIZE = 50;

async function fetchUserGroupsPage(
  wsId: string,
  params: UserGroupsParams = {}
): Promise<UserGroupsPageResponse> {
  const { q = '', page = 1, pageSize = GROUPS_INFINITE_PAGE_SIZE } = params;
  const searchParams = new URLSearchParams();

  if (q) searchParams.set('q', q);
  searchParams.set('page', String(page));
  searchParams.set('pageSize', String(pageSize));

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups?${searchParams.toString()}`,
    { cache: 'no-store' }
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

  return {
    ...json,
    page,
    pageSize,
  };
}

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
      const { data, count, error, errorMessage } = await fetchUserGroupsPage(
        wsId,
        {
          q,
          page,
          pageSize,
        }
      );

      return { data, count, error, errorMessage };
    },
    enabled: options?.enabled !== false,
    initialData: options?.initialData,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useInfiniteUserGroups(
  wsId: string,
  params: Pick<UserGroupsParams, 'q' | 'pageSize'> = {},
  options?: {
    enabled?: boolean;
    initialData?: UserGroupsResponse;
  }
) {
  const { q = '', pageSize = GROUPS_INFINITE_PAGE_SIZE } = params;

  const query = useInfiniteQuery({
    queryKey: ['workspace-user-groups-infinite', wsId, { q, pageSize }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchUserGroupsPage(wsId, {
        q,
        page: pageParam,
        pageSize,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, currentPage) => total + currentPage.data.length,
        0
      );

      if (loadedCount >= lastPage.count) {
        return undefined;
      }

      return allPages.length + 1;
    },
    enabled: options?.enabled !== false,
    initialData: options?.initialData
      ? {
          pages: [
            {
              ...options.initialData,
              page: 1,
              pageSize,
            },
          ],
          pageParams: [1],
        }
      : undefined,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const groups = query.data?.pages.flatMap((page) => page.data) ?? [];
  const count = query.data?.pages[0]?.count ?? 0;

  return {
    ...query,
    groups,
    count,
  };
}
