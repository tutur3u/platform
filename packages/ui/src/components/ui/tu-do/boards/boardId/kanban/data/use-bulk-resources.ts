'use client';

import { useQuery } from '@tanstack/react-query';
import {
  listWorkspaceLabels,
  listWorkspaceTaskProjects,
} from '@tuturuuu/internal-api';
import { listWorkspaceTaskBoardViewableMembers } from '@tuturuuu/internal-api/tasks';
import type { Workspace } from '@tuturuuu/types';
import {
  useWorkspaceMembers,
  type WorkspaceMember,
} from '@tuturuuu/ui/hooks/use-workspace-members';

export function useBulkResources({
  boardId,
  canUseBoardAssignees,
  assigneeMemberSource,
  workspace,
  isMultiSelectMode,
  selectedCount,
}: {
  boardId?: string | null;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: 'workspace' | 'board' | 'workspace-and-board';
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
  const shouldLoadMembers =
    canUseBoardAssignees !== false && isMultiSelectMode && selectedCount > 0;
  const effectiveAssigneeMemberSource =
    assigneeMemberSource ?? (workspace.personal ? 'board' : 'workspace');
  const { data: workspaceMembersData = [] } = useWorkspaceMembers(
    workspace.id,
    {
      enabled:
        !!workspace.id &&
        shouldLoadMembers &&
        effectiveAssigneeMemberSource !== 'board',
    }
  );
  const { data: boardViewableMembers = [] } = useQuery({
    queryKey: ['task-board-viewable-members', workspace.id, boardId],
    queryFn: async (): Promise<WorkspaceMember[]> => {
      if (!workspace.id || !boardId) return [];

      const payload = await listWorkspaceTaskBoardViewableMembers(
        workspace.id,
        boardId
      );

      return payload.members.map((member) => ({
        id: member.user_id,
        user_id: member.user_id,
        workspace_id: workspace.id,
        display_name: member.display_name ?? member.email ?? member.user_id,
        email: member.email ?? undefined,
        avatar_url: member.avatar_url ?? undefined,
      }));
    },
    enabled:
      !!workspace.id &&
      !!boardId &&
      shouldLoadMembers &&
      effectiveAssigneeMemberSource !== 'workspace',
    staleTime: 5 * 60 * 1000,
  });
  const workspaceMembers: WorkspaceMember[] = [
    ...workspaceMembersData,
    ...boardViewableMembers.filter(
      (boardMember) =>
        !workspaceMembersData.some(
          (workspaceMember) =>
            (workspaceMember.user_id ?? workspaceMember.id) ===
            boardMember.user_id
        )
    ),
  ];

  return { workspaceLabels, workspaceProjects, workspaceMembers };
}
