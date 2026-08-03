import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';

export function resolveWorkspaceAvatarUrl(
  avatarUrl: string | null | undefined,
  {
    rootWorkspaceLogoUrl,
  }: {
    rootWorkspaceLogoUrl?: string;
  } = {}
) {
  return avatarUrl || rootWorkspaceLogoUrl || null;
}

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

export function buildWorkspaceSetupHandoffUrl({
  locale,
  platformUrl,
  returnOrigin,
  returnPath,
  workspaceId,
}: {
  locale: string;
  platformUrl: string;
  returnOrigin: string;
  returnPath: string;
  workspaceId: string;
}) {
  const origin = new URL(returnOrigin).origin;
  const returnUrl = new URL(returnPath, origin);

  if (returnUrl.origin !== origin) {
    throw new Error('Workspace return path must stay on the current app');
  }

  const localePrefix = `/${locale}`;
  if (
    returnUrl.pathname !== localePrefix &&
    !returnUrl.pathname.startsWith(`${localePrefix}/`)
  ) {
    returnUrl.pathname = `${localePrefix}${
      returnUrl.pathname.startsWith('/') ? '' : '/'
    }${returnUrl.pathname}`;
  }

  const setupUrl = new URL(
    `/${locale}/${encodeURIComponent(workspaceId)}/workspace-setup`,
    platformUrl
  );
  setupUrl.searchParams.set('returnUrl', returnUrl.toString());

  return setupUrl.toString();
}

export function normalizeWorkspaceSwitchPath(
  pathname: string,
  nextSlug: string
) {
  const taskBoardPaths = [`/${nextSlug}/boards`, `/${nextSlug}/tasks/boards`];

  if (
    taskBoardPaths.some(
      (taskBoardsPath) =>
        pathname === taskBoardsPath || pathname.startsWith(`${taskBoardsPath}/`)
    )
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
