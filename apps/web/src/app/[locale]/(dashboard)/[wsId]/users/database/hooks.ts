'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  listAllWorkspaceUserGroups,
  listWorkspaceUserGroupsByIds,
} from '@tuturuuu/internal-api/user-groups';
import {
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  getWorkspaceConfigIdList,
} from '@tuturuuu/internal-api/workspace-configs';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import type { GroupMembershipFilter } from './group-membership';
import type {
  UsersDatabaseRequireAttention,
  UsersDatabaseStatus,
} from './resolved-filters';

export interface WorkspaceUsersParams {
  q?: string;
  page?: number;
  pageSize?: number;
  includedGroups?: string[];
  excludedGroups?: string[];
  status?: UsersDatabaseStatus;
  linkStatus?: 'all' | 'linked' | 'virtual';
  requireAttention?: UsersDatabaseRequireAttention;
  groupMembership?: GroupMembershipFilter;
}

export interface WorkspaceUsersResponse {
  data: WorkspaceUser[];
  count: number;
  permissions?: {
    hasPrivateInfo: boolean;
    hasPublicInfo: boolean;
    canCheckUserAttendance: boolean;
  };
}

interface PossibleExcludedGroupsPageResponse {
  count: number;
  data: UserGroup[];
  pageSize: number;
}

export async function fetchWorkspaceUsers(
  wsId: string,
  params: Required<WorkspaceUsersParams>
): Promise<WorkspaceUsersResponse> {
  const response = await fetch(`/api/v1/workspaces/${wsId}/users/database`, {
    body: JSON.stringify(params),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch workspace users');
  }

  return response.json();
}

export async function fetchPossibleExcludedGroupsPage(
  wsId: string,
  params: {
    includedGroups: string[];
    page?: number;
    pageSize?: number;
    paginated?: boolean;
    q?: string;
  }
): Promise<PossibleExcludedGroupsPageResponse> {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups/possible-excluded`,
    {
      body: JSON.stringify(params),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch possible excluded groups');
  }

  return (await response.json()) as PossibleExcludedGroupsPageResponse;
}

export async function fetchPossibleExcludedGroups(
  wsId: string,
  includedGroups: string[]
): Promise<UserGroup[]> {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups/possible-excluded`,
    {
      body: JSON.stringify({ includedGroups }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch possible excluded groups');
  }

  return (await response.json()) as UserGroup[];
}

export async function fetchFeaturedGroupCounts(
  wsId: string,
  params: FeaturedGroupCountsParams & { featuredGroupIds: string[] }
): Promise<Record<string, number>> {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups/featured-counts`,
    {
      body: JSON.stringify({
        excludedGroups: params.excludedGroups ?? [],
        featuredGroupIds: params.featuredGroupIds,
        linkStatus: params.linkStatus ?? 'all',
        q: params.searchQuery ?? '',
        status: params.status ?? 'active',
      }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch featured group counts');
  }

  return (await response.json()) as Record<string, number>;
}

/**
 * Fetch workspace users with search, filter and pagination support
 */
export function useWorkspaceUsers(
  wsId: string,
  params: WorkspaceUsersParams = {},
  options?: {
    enabled?: boolean;
    initialData?: WorkspaceUsersResponse;
  }
) {
  const {
    q = '',
    page = 1,
    pageSize = 10,
    includedGroups = [],
    excludedGroups = [],
    status = 'active',
    linkStatus = 'all',
    requireAttention = 'all',
    groupMembership = 'all',
  } = params;

  return useQuery({
    queryKey: [
      'workspace-users',
      wsId,
      {
        q,
        page,
        pageSize,
        includedGroups,
        excludedGroups,
        status,
        linkStatus,
        requireAttention,
        groupMembership,
      },
    ],
    queryFn: () =>
      fetchWorkspaceUsers(wsId, {
        q,
        page,
        pageSize,
        includedGroups,
        excludedGroups,
        status,
        linkStatus,
        requireAttention,
        groupMembership,
      }),
    enabled: options?.enabled !== false,
    initialData: options?.initialData,
    // Keep previous data while fetching new page - prevents UI from becoming unresponsive
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Fetch user groups for filtering
 */
export function useWorkspaceUserGroups(
  wsId: string,
  options?: { ensureGroupIds?: string[] }
) {
  const normalizedEnsureGroupIds = [
    ...new Set((options?.ensureGroupIds ?? []).filter(Boolean)),
  ];

  return useQuery({
    queryKey: ['workspace-user-groups', wsId, normalizedEnsureGroupIds],
    queryFn: async () => {
      const groups = await listAllWorkspaceUserGroups(wsId);
      const groupIds = new Set(groups.map((group) => group.id));
      const missingGroupIds = normalizedEnsureGroupIds.filter(
        (groupId) => !groupIds.has(groupId)
      );
      const ensuredGroups = await listWorkspaceUserGroupsByIds(
        wsId,
        missingGroupIds
      );

      ensuredGroups.forEach((group) => {
        if (!groupIds.has(group.id)) {
          groups.push(group);
        }
      });

      return groups;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useExcludedUserGroups(
  wsId: string,
  includedGroups: string[] = []
) {
  return useQuery({
    queryKey: ['excluded-user-groups', wsId, includedGroups],
    queryFn: async (): Promise<UserGroup[]> => {
      // If no included groups, return all groups
      if (includedGroups.length === 0) {
        return listAllWorkspaceUserGroups(wsId);
      }

      return fetchPossibleExcludedGroups(wsId, includedGroups);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Fetch user fields for the workspace
 */
export function useWorkspaceUserFields(wsId: string) {
  return useQuery({
    queryKey: ['workspace-user-fields', wsId],
    queryFn: async (): Promise<WorkspaceUserField[]> => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/users/fields`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch workspace user fields');
      }

      return (await response.json()) as WorkspaceUserField[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useFeaturedGroups(
  wsId: string,
  options?: { initialData?: string[] }
) {
  return useQuery({
    queryKey: ['workspace-featured-groups', wsId],
    queryFn: () =>
      getWorkspaceConfigIdList(wsId, DATABASE_FEATURED_GROUPS_CONFIG_ID),
    initialData: options?.initialData,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 20 * 60 * 1000, // 20 minutes
  });
}

/**
 * Fetch default excluded groups for the workspace
 */
export interface FeaturedGroupCountsParams {
  excludedGroups?: string[];
  searchQuery?: string;
  status?: string;
  linkStatus?: string;
}

export function useFeaturedGroupCounts(
  wsId: string,
  featuredGroupIds: string[],
  params: FeaturedGroupCountsParams = {}
) {
  const {
    excludedGroups = [],
    searchQuery = '',
    status = 'active',
    linkStatus = 'all',
  } = params;

  return useQuery({
    queryKey: [
      'featured-group-counts',
      wsId,
      featuredGroupIds,
      { excludedGroups, searchQuery, status, linkStatus },
    ],
    queryFn: async (): Promise<Record<string, number>> => {
      return fetchFeaturedGroupCounts(wsId, {
        excludedGroups,
        featuredGroupIds,
        linkStatus,
        searchQuery,
        status,
      });
    },
    enabled: featuredGroupIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds — matches useWorkspaceUsers
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useDefaultExcludedGroups(
  wsId: string,
  options?: { initialData?: string[] }
) {
  return useQuery({
    queryKey: ['workspace-default-excluded-groups', wsId],
    queryFn: () =>
      getWorkspaceConfigIdList(
        wsId,
        DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID
      ),
    initialData: options?.initialData,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 20 * 60 * 1000, // 20 minutes
  });
}

export function useDefaultIncludedGroups(
  wsId: string,
  options?: { initialData?: string[] }
) {
  return useQuery({
    queryKey: ['workspace-default-included-groups', wsId],
    queryFn: () =>
      getWorkspaceConfigIdList(
        wsId,
        DATABASE_DEFAULT_INCLUDED_GROUPS_CONFIG_ID
      ),
    initialData: options?.initialData,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 20 * 60 * 1000, // 20 minutes
  });
}
