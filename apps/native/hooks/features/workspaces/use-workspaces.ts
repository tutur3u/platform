import type { UseQueryOptions } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types';
import { queryKeys } from '@/lib/query';
import { useAuthStore } from '@/lib/stores/auth-store';
import { supabase } from '@/lib/supabase';

/**
 * Fetch all workspaces the user has access to
 */
type UseWorkspacesOptions = Omit<
  UseQueryOptions<Workspace[], Error>,
  'queryKey' | 'queryFn' | 'enabled'
> & {
  enabled?: boolean;
};

type UseWorkspaceOptions = Omit<
  UseQueryOptions<Workspace | null, Error>,
  'queryKey' | 'queryFn' | 'enabled'
> & {
  enabled?: boolean;
};

export function useWorkspaces(options: UseWorkspacesOptions = {}) {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const { enabled = true, ...rest } = options;

  return useQuery<Workspace[], Error>({
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
    enabled: !!userId && enabled,
    ...rest,
  });
}

/**
 * Fetch a single workspace by ID
 */
export function useWorkspace(
  wsId: string | undefined,
  options: UseWorkspaceOptions = {}
) {
  const { enabled = true, ...rest } = options;

  return useQuery<Workspace | null, Error>({
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
    enabled: !!wsId && enabled,
    ...rest,
  });
}
