'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import {
  getNextWorkspaceUserGroupsPageParam,
  listWorkspaceUserGroups,
  type WorkspaceUserGroupsParams,
  type WorkspaceUserGroupsResponse,
} from '@tuturuuu/internal-api/user-groups';

export type UserGroupsParams = WorkspaceUserGroupsParams;
export type UserGroupsResponse = WorkspaceUserGroupsResponse;
export type { UserGroupStatusFilter } from '@tuturuuu/internal-api/user-groups';

/**
 * Type for manager user data from workspace_users table.
 * Used when fetching group managers.
 */
export type { ManagerUser } from '@tuturuuu/users-core/lib/user-groups/manager-user';

const GROUPS_INFINITE_PAGE_SIZE = 50;

export function useUserGroups(
  wsId: string,
  params: UserGroupsParams = {},
  options?: {
    enabled?: boolean;
    initialData?: UserGroupsResponse;
  }
) {
  const {
    includeArchived = false,
    q = '',
    page = 1,
    pageSize = 10,
    status = includeArchived ? 'all' : 'active',
  } = params;

  return useQuery({
    queryKey: ['workspace-user-groups', wsId, { q, page, pageSize, status }],
    queryFn: async (): Promise<UserGroupsResponse> => {
      const { data, count, error, errorMessage } =
        await listWorkspaceUserGroups(wsId, {
          includeArchived,
          q,
          page,
          pageSize,
          status,
        });

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
  params: Pick<
    UserGroupsParams,
    'includeArchived' | 'q' | 'pageSize' | 'status'
  > = {},
  options?: {
    enabled?: boolean;
    initialData?: UserGroupsResponse;
  }
) {
  const {
    includeArchived = false,
    q = '',
    pageSize = GROUPS_INFINITE_PAGE_SIZE,
    status = includeArchived ? 'all' : 'active',
  } = params;

  const query = useInfiniteQuery({
    queryKey: ['workspace-user-groups-infinite', wsId, { q, pageSize, status }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listWorkspaceUserGroups(wsId, {
        includeArchived,
        q,
        page: pageParam,
        pageSize,
        status,
      }),
    getNextPageParam: getNextWorkspaceUserGroupsPageParam,
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
    placeholderData: keepPreviousData,
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
