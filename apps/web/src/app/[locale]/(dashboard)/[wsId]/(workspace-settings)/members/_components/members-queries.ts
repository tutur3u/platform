'use client';

import { useQuery } from '@tanstack/react-query';
import { listEnhancedWorkspaceMembers } from '@tuturuuu/internal-api/workspaces';

export const memberStatusValues = ['all', 'joined', 'invited'] as const;
export type MemberStatus = (typeof memberStatusValues)[number];

export const workspaceMembersKeys = {
  all: ['workspace-members'] as const,
  lists: () => [...workspaceMembersKeys.all, 'list'] as const,
  list: (workspaceId: string, status: MemberStatus) =>
    [...workspaceMembersKeys.lists(), workspaceId, status] as const,
};

export function useWorkspaceMembers(workspaceId: string, status: MemberStatus) {
  return useQuery({
    queryKey: workspaceMembersKeys.list(workspaceId, status),
    queryFn: () => listEnhancedWorkspaceMembers(workspaceId, status),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}
