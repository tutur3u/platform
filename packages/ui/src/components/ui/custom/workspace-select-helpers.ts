import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';

export function mergeWorkspaceSelectWorkspaces(
  workspaces: InternalApiWorkspaceSummary[] | undefined,
  currentWorkspaceFallback: InternalApiWorkspaceSummary | null | undefined
) {
  const workspaceList = workspaces ?? [];

  if (!currentWorkspaceFallback) return workspaceList;

  if (
    workspaceList.some(
      (workspace) => workspace.id === currentWorkspaceFallback.id
    )
  ) {
    return workspaceList;
  }

  return [...workspaceList, currentWorkspaceFallback];
}
