'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';

/**
 * Shared helper to fetch all workspace user groups
 * Used by both useWorkspaceUserGroups and useExcludedUserGroups
 */
async function fetchAllWorkspaceUserGroups(wsId: string): Promise<UserGroup[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('workspace_user_groups_with_amount')
    .select('id, name, amount')
    .eq('ws_id', wsId)
    .order('name');

  if (error) throw error;
  return data as UserGroup[];
}

export interface WorkspaceUsersParams {
  q?: string;
  page?: number;
  pageSize?: number;
  includedGroups?: string[];
  excludedGroups?: string[];
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
  } = params;

  return useQuery({
    queryKey: [
      'workspace-users',
      wsId,
      { q, page, pageSize, includedGroups, excludedGroups },
    ],
    queryFn: async (): Promise<WorkspaceUsersResponse> => {
      const searchParams = new URLSearchParams();

      if (q) searchParams.set('q', q);
      searchParams.set('page', String(page));
      searchParams.set('pageSize', String(pageSize));

      includedGroups.forEach((group) => {
        searchParams.append('includedGroups', group);
      });

      excludedGroups.forEach((group) => {
        searchParams.append('excludedGroups', group);
      });

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/database?${searchParams.toString()}`
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
export function useWorkspaceUserGroups(wsId: string) {
  return useQuery({
    queryKey: ['workspace-user-groups', wsId],
    queryFn: () => fetchAllWorkspaceUserGroups(wsId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Fetch possible excluded groups based on current included groups
 */
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

      // Use RPC to get possible excluded groups
      const supabase = createClient();
      const { data, error } = await supabase
        .rpc('get_possible_excluded_groups', {
          _ws_id: wsId,
          included_groups: includedGroups,
        })
        .select('id, name, amount')
        .order('name');

      if (error) throw error;
      return data as UserGroup[];
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
      const supabase = createClient();

      const { data, error } = await supabase
        .from('workspace_user_fields')
        .select('*')
        .eq('ws_id', wsId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as WorkspaceUserField[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
