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

export function normalizeWorkspaceSwitchPath(
  pathname: string,
  nextSlug: string
) {
  const taskBoardsPath = `/${nextSlug}/tasks/boards`;

  if (
    pathname === taskBoardsPath ||
    pathname.startsWith(`${taskBoardsPath}/`)
  ) {
    return `/${nextSlug}/tasks`;
  }

  const uuidRegex =
    /\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$/;

  if (uuidRegex.test(pathname) && pathname !== `/${nextSlug}`) {
    return pathname.replace(uuidRegex, '');
  }

  return pathname;
}
