function stripTrailingSlash(path: string) {
  return path.replace(/\/$/, '') || '/';
}

export function getCmsWorkspaceBasePath(pathname: string) {
  return stripTrailingSlash(
    pathname
      .replace(/\/library\/entries\/[^/]+$/, '')
      .replace(/\/library\/collections\/[^/]+$/, '')
      .replace(/\/library$/, '')
      .replace(/\/games$/, '')
      .replace(/\/members$/, '')
      .replace(/\/preview$/, '')
      .replace(/\/projects$/, '')
      .replace(/\/settings$/, '')
  );
}

export function getCmsLibraryPath(pathname: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/library`;
}

function getCmsActiveContentPath(pathname: string) {
  return /\/games$/u.test(stripTrailingSlash(pathname))
    ? `${getCmsWorkspaceBasePath(pathname)}/games`
    : getCmsLibraryPath(pathname);
}

export function getCmsCollectionPath(pathname: string, collectionId: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/library/collections/${collectionId}`;
}

export function getCmsEntryPath(pathname: string, entryId: string) {
  return `${getCmsActiveContentPath(pathname)}?entryId=${entryId}`;
}

export function getCmsPreviewPath(pathname: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/preview`;
}

export function getCmsProjectsPath(pathname: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/projects`;
}
