'use client';

import { useQuery } from '@tanstack/react-query';
import {
  listWorkspaceLabels,
  listWorkspaceTaskProjects,
} from '@tuturuuu/internal-api';
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
      const data = await listWorkspaceLabels(workspace.id);
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
      const projects = await listWorkspaceTaskProjects(workspace.id);
      return projects.filter((project) => project.status !== 'deleted');
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
