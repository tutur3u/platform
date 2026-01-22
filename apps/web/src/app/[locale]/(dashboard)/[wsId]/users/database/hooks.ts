'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import type {
  BalanceStrategy,
  BulkMergePair,
  BulkMergePreview,
  BulkMergeResult,
  DuplicatesResponse,
  FieldStrategy,
  MergePreview,
  MergeResult,
} from '@tuturuuu/types/primitives/WorkspaceUserMerge';

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
  status?: 'active' | 'archived' | 'archived_until' | 'all';
  linkStatus?: 'all' | 'linked' | 'virtual';
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
  } = params;

  return useQuery({
    queryKey: [
      'workspace-users',
      wsId,
      { q, page, pageSize, includedGroups, excludedGroups, status, linkStatus },
    ],
    queryFn: async (): Promise<WorkspaceUsersResponse> => {
      const searchParams = new URLSearchParams();

      if (q) searchParams.set('q', q);
      searchParams.set('page', String(page));
      searchParams.set('pageSize', String(pageSize));
      searchParams.set('status', status);
      searchParams.set('linkStatus', linkStatus);

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

// ============================================================================
// Duplicate Detection & Merge Hooks
// ============================================================================

/**
 * Fetch duplicate workspace users by email or phone
 */
export function useDuplicateWorkspaceUsers(
  wsId: string,
  type: 'email' | 'phone' | 'all' = 'all',
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['workspace-user-duplicates', wsId, type],
    queryFn: async (): Promise<DuplicatesResponse> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/duplicates?type=${type}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch duplicates');
      }

      return response.json();
    },
    enabled: options?.enabled !== false,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch merge preview for two users
 */
export function useWorkspaceUserMergePreview(
  wsId: string,
  keepUserId: string | null,
  deleteUserId: string | null,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['workspace-user-merge-preview', wsId, keepUserId, deleteUserId],
    queryFn: async (): Promise<MergePreview> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/merge/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepUserId, deleteUserId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch merge preview');
      }

      return response.json();
    },
    enabled:
      options?.enabled !== false &&
      keepUserId !== null &&
      deleteUserId !== null,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Mutation to merge two workspace users
 */
export function useMergeWorkspaceUsers(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      keepUserId: string;
      deleteUserId: string;
      fieldStrategy?: FieldStrategy;
      balanceStrategy?: BalanceStrategy;
    }): Promise<MergeResult> => {
      const response = await fetch(`/api/v1/workspaces/${wsId}/users/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.message || error.error || 'Failed to merge users'
        );
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate relevant queries after successful merge
      queryClient.invalidateQueries({
        queryKey: ['workspace-users', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-duplicates', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-merge-preview', wsId],
      });
    },
  });
}

/**
 * Fetch bulk merge preview for multiple user pairs
 */
export function useBulkMergePreview(
  wsId: string,
  pairs: BulkMergePair[],
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['workspace-user-bulk-merge-preview', wsId, pairs],
    queryFn: async (): Promise<BulkMergePreview> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/merge/bulk/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pairs }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch bulk merge preview');
      }

      return response.json();
    },
    enabled: options?.enabled !== false && pairs.length > 0,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Mutation to bulk merge multiple user pairs
 */
export function useBulkMergeWorkspaceUsers(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      pairs: BulkMergePair[];
      balanceStrategy?: BalanceStrategy;
    }): Promise<BulkMergeResult> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/merge/bulk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to bulk merge users');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate relevant queries after successful bulk merge
      queryClient.invalidateQueries({
        queryKey: ['workspace-users', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-duplicates', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-bulk-merge-preview', wsId],
      });
    },
  });
}
