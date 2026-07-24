import { toWorkspaceSlug } from '@tuturuuu/utils/constants';

interface BuildWorkspaceTaskUrlOptions {
  boardId: string;
  currentPathname: string;
  origin?: string;
  taskId: string;
  workspaceId: string;
  isPersonalWorkspace?: boolean;
  routePrefix?: string;
}

function getLocalePrefixFromPathname(
  currentPathname: string,
  workspaceSlug: string,
  workspaceId: string
) {
  const wsSegment = `/${workspaceSlug}`;
  const fallbackWsSegment = `/${workspaceId}`;
  const wsIndex = currentPathname.indexOf(wsSegment);
  const fallbackWsIndex = currentPathname.indexOf(fallbackWsSegment);

  if (wsIndex > 0) {
    return currentPathname.substring(0, wsIndex);
  }

  if (fallbackWsIndex > 0) {
    return currentPathname.substring(0, fallbackWsIndex);
  }

  return '';
}

function inferRoutePrefix(
  currentPathname: string,
  workspaceSlug: string,
  workspaceId: string
) {
  const segments = currentPathname.split('/').filter(Boolean);
  const workspaceSegmentIndex = segments.findIndex(
    (segment) => segment === workspaceSlug || segment === workspaceId
  );

  return workspaceSegmentIndex >= 0 &&
    segments[workspaceSegmentIndex + 1] === 'boards'
    ? ''
    : '/tasks';
}

export function buildWorkspaceTaskUrl({
  boardId,
  currentPathname,
  origin,
  taskId,
  workspaceId,
  isPersonalWorkspace = false,
  routePrefix,
}: BuildWorkspaceTaskUrlOptions) {
  const workspaceSlug = toWorkspaceSlug(workspaceId, {
    personal: isPersonalWorkspace,
  });
  const localePrefix = getLocalePrefixFromPathname(
    currentPathname,
    workspaceSlug,
    workspaceId
  );
  const resolvedRoutePrefix =
    routePrefix ??
    inferRoutePrefix(currentPathname, workspaceSlug, workspaceId);
  const normalizedRoutePrefix = resolvedRoutePrefix
    ? `/${resolvedRoutePrefix.replace(/^\/+|\/+$/g, '')}`
    : '';
  const relativeUrl = `${localePrefix}/${workspaceSlug}${normalizedRoutePrefix}/boards/${boardId}?task=${taskId}`;

  if (!origin) {
    return relativeUrl;
  }

  return `${origin}${relativeUrl}`;
}
