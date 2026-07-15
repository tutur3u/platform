import { toWorkspaceSlug } from '@tuturuuu/utils/constants';

interface BuildWorkspaceTaskUrlOptions {
  boardId: string;
  currentPathname: string;
  origin?: string;
  taskId: string;
  workspaceId: string;
  isPersonalWorkspace?: boolean;
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

export function buildWorkspaceTaskUrl({
  boardId,
  currentPathname,
  origin,
  taskId,
  workspaceId,
  isPersonalWorkspace = false,
}: BuildWorkspaceTaskUrlOptions) {
  const workspaceSlug = toWorkspaceSlug(workspaceId, {
    personal: isPersonalWorkspace,
  });
  const localePrefix = getLocalePrefixFromPathname(
    currentPathname,
    workspaceSlug,
    workspaceId
  );
  const relativeUrl = `${localePrefix}/${workspaceSlug}/tasks/boards/${boardId}?task=${taskId}`;

  if (!origin) {
    return relativeUrl;
  }

  return `${origin}${relativeUrl}`;
}
