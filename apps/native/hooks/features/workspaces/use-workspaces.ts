import { useQuery } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types';
import { queryKeys } from '@/lib/query';
import { useAuthStore } from '@/lib/stores/auth-store';
import { supabase } from '@/lib/supabase';

/**
 * Fetch all workspaces the user has access to
 */
export function useWorkspaces() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';

  return useQuery<Workspace[]>({
    queryKey: queryKeys.workspaces.list(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*, workspace_members!inner(user_id)')
        .eq('workspace_members.user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as Workspace[];
    },
    enabled: !!userId,
  });
}

/**
 * Fetch a single workspace by ID
 */
export function useWorkspace(wsId: string | undefined) {
  return useQuery<Workspace | null>({
    queryKey: queryKeys.workspaces.detail(wsId ?? ''),
    queryFn: async () => {
      if (!wsId) return null;

      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', wsId)
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return data;
    },
    enabled: !!wsId,
  });
}
