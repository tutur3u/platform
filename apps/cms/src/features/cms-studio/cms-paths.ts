function stripTrailingSlash(path: string) {
  return path.replace(/\/$/, '') || '/';
}

export function getCmsWorkspaceBasePath(pathname: string) {
  return stripTrailingSlash(
    pathname
      .replace(/\/content\/entries\/[^/]+$/, '')
      .replace(/\/content\/collections\/[^/]+$/, '')
      .replace(/\/content$/, '')
      .replace(/\/pages$/, '')
      .replace(/\/games$/, '')
      .replace(/\/members$/, '')
      .replace(/\/preview$/, '')
      .replace(/\/projects$/, '')
      .replace(/\/settings$/, '')
  );
}

export function getCmsLibraryPath(pathname: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/content`;
}

function getCmsActiveContentPath(pathname: string) {
  const strippedPathname = stripTrailingSlash(pathname);

  if (/\/games$/u.test(strippedPathname)) {
    return `${getCmsWorkspaceBasePath(pathname)}/games`;
  }

  if (/\/pages$/u.test(strippedPathname)) {
    return `${getCmsWorkspaceBasePath(pathname)}/pages`;
  }

  return getCmsLibraryPath(pathname);
}

export function getCmsCollectionPath(pathname: string, collectionId: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/content/collections/${collectionId}`;
}

export function getCmsEntryPath(pathname: string, entryId: string) {
  return `${getCmsActiveContentPath(pathname)}?entryId=${entryId}`;
}

type CmsDialogHistory = Pick<History, 'replaceState' | 'state'>;

export function replaceCmsDialogHistoryPath(
  history: CmsDialogHistory,
  path: string
) {
  history.replaceState(history.state, '', path);
}

export function getCmsPreviewPath(pathname: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/preview`;
}

export function getCmsProjectsPath(pathname: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/projects`;
}
