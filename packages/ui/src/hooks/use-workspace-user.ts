'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';

/**
 * Hook to fetch the current workspace user with their private details
 * Uses React Query for client-side caching and state management
 *
 * @returns Query object with user data, loading state, and error info
 */
export function useWorkspaceUser() {
  return useQuery({
    queryKey: ['workspace-user'],
    queryFn: async (): Promise<WorkspaceUser> => {
      const supabase = createClient();

      // Get current authenticated user
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // Fetch user data with private details
      const { data, error } = await supabase
        .from('users')
        .select(
          'id, display_name, avatar_url, bio, handle, created_at, user_private_details(email, new_email, birthday, full_name, default_workspace_id)'
        )
        .eq('id', user.id)
        .single();

      if (error) {
        throw new Error(`Failed to fetch user: ${error.message}`);
      }

      if (!data) {
        throw new Error('User data not found');
      }

      // Merge user data with private details
      const { user_private_details, ...rest } = data;
      return {
        ...rest,
        ...user_private_details,
      } as WorkspaceUser;
    },
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep cached data for 10 minutes
    retry: 1, // Retry once on failure
  });
}