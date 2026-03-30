'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  DATABASE_DEFAULT_EXCLUDED_GROUPS_CONFIG_ID,
  DATABASE_FEATURED_GROUPS_CONFIG_ID,
  getWorkspaceConfigIdList,
} from '@tuturuuu/internal-api/workspace-configs';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import type { GroupMembershipFilter } from './group-membership';

const GROUPS_PAGE_SIZE = 200;

/**
 * Shared helper to fetch all workspace user groups
 * Used by both useWorkspaceUserGroups and useExcludedUserGroups
 */
async function fetchAllWorkspaceUserGroups(wsId: string): Promise<UserGroup[]> {
  const groups: UserGroup[] = [];
  let page = 1;
  let totalCount = Number.POSITIVE_INFINITY;

  while (groups.length < totalCount) {
    const response = await fetch(
      `/api/v1/workspaces/${wsId}/users/groups?page=${page}&pageSize=${GROUPS_PAGE_SIZE}`,
      {
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch workspace user groups');
    }

    const payload = (await response.json()) as {
      data?: UserGroup[];
      count?: number;
    };
    const pageData = payload.data ?? [];
    totalCount = payload.count ?? pageData.length;
    groups.push(...pageData);

    if (pageData.length < GROUPS_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return groups;
}

async function fetchWorkspaceUserGroupsByIds(
  wsId: string,
  groupIds: string[]
): Promise<UserGroup[]> {
  if (groupIds.length === 0) {
    return [];
  }

  const searchParams = new URLSearchParams();
  searchParams.set('ids', groupIds.join(','));
  searchParams.set('page', '1');
  searchParams.set('pageSize', String(Math.max(groupIds.length, 1)));

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups?${searchParams.toString()}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch selected workspace user groups');
  }

  const payload = (await response.json()) as {
    data?: UserGroup[];
  };

  return payload.data ?? [];
}

export interface WorkspaceUsersParams {
  q?: string;
  page?: number;
  pageSize?: number;
  includedGroups?: string[];
  excludedGroups?: string[];
  status?: 'active' | 'archived' | 'archived_until' | 'all';
  linkStatus?: 'all' | 'linked' | 'virtual';
  requireAttention?: 'all' | 'true' | 'false';
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
    queryFn: async (): Promise<WorkspaceUsersResponse> => {
      const searchParams = new URLSearchParams();

      if (q) searchParams.set('q', q);
      searchParams.set('page', String(page));
      searchParams.set('pageSize', String(pageSize));
      searchParams.set('status', status);
      searchParams.set('linkStatus', linkStatus);
      searchParams.set('requireAttention', requireAttention);
      searchParams.set('groupMembership', groupMembership);

      includedGroups.forEach((group) => {
        searchParams.append('includedGroups', group);
      });

      excludedGroups.forEach((group) => {
        searchParams.append('excludedGroups', group);
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/database?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace users');
      }

      return response.json();
    },
    enabled: options?.enabled !== false,
    initialData: options?.initialData,
    // Keep previous data while fetching new page - prevents UI from becoming unresponsive
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
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
      const groups = await fetchAllWorkspaceUserGroups(wsId);
      const groupIds = new Set(groups.map((group) => group.id));
      const missingGroupIds = normalizedEnsureGroupIds.filter(
        (groupId) => !groupIds.has(groupId)
      );
      const ensuredGroups = await fetchWorkspaceUserGroupsByIds(
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
        return fetchAllWorkspaceUserGroups(wsId);
      }

      // Use backend API to get possible excluded groups
      const searchParams = new URLSearchParams();
      includedGroups.forEach((group) => {
        searchParams.append('includedGroups', group);
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/groups/possible-excluded?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch possible excluded groups');
      }

      return (await response.json()) as UserGroup[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
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
      const searchParams = new URLSearchParams();
      featuredGroupIds.forEach((id) => {
        searchParams.append('featuredGroupIds', id);
      });
      excludedGroups.forEach((id) => {
        searchParams.append('excludedGroups', id);
      });
      if (searchQuery) searchParams.set('q', searchQuery);
      searchParams.set('status', status);
      searchParams.set('linkStatus', linkStatus);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/groups/featured-counts?${searchParams.toString()}`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch featured group counts');
      }

      return (await response.json()) as Record<string, number>;
    },
    enabled: featuredGroupIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds — matches useWorkspaceUsers
    gcTime: 5 * 60 * 1000, // 5 minutes
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
