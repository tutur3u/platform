'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import { useWorkspaceMembers } from '@tuturuuu/ui/hooks/use-workspace-members';

export function useBulkResources({
  workspace,
  isMultiSelectMode,
  selectedCount,
}: {
  workspace: Workspace;
  isMultiSelectMode: boolean;
  selectedCount: number;
}) {
  // Workspace labels for bulk operations
  const { data: workspaceLabels = [] } = useQuery({
    queryKey: ['workspace_task_labels', workspace.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_task_labels')
        .select('id, name, color, created_at, ws_id')
        .eq('ws_id', workspace.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        color: string;
        created_at: string;
        ws_id: string;
      }[];
    },
    staleTime: 30000,
    enabled: isMultiSelectMode && selectedCount > 0,
  });

  // Workspace projects for bulk operations
  const { data: workspaceProjects = [] } = useQuery({
    queryKey: ['task_projects', workspace.id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('task_projects')
        .select('id, name, status')
        .eq('ws_id', workspace.id)
        .eq('deleted', false)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
    enabled: isMultiSelectMode && selectedCount > 0,
  });

  // Workspace members for bulk operations
  const { data: workspaceMembers = [] } = useWorkspaceMembers(workspace.id, {
    enabled:
      !!workspace.id &&
      !workspace.personal &&
      isMultiSelectMode &&
      selectedCount > 0,
  });

  return { workspaceLabels, workspaceProjects, workspaceMembers };
}
