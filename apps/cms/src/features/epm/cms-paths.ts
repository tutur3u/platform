function stripTrailingSlash(path: string) {
  return path.replace(/\/$/, '') || '/';
}

export function getCmsWorkspaceBasePath(pathname: string) {
  return stripTrailingSlash(
    pathname
      .replace(/\/content\/[^/]+$/, '')
      .replace(/\/content$/, '')
      .replace(/\/collections\/[^/]+$/, '')
      .replace(/\/preview$/, '')
      .replace(/\/admin$/, '')
  );
}

export function getCmsContentPath(pathname: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/content`;
}

export function getCmsCollectionPath(pathname: string, collectionId: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/collections/${collectionId}`;
}

export function getCmsEntryPath(pathname: string, entryId: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/content/${entryId}`;
}

export function getCmsAdminPath(pathname: string) {
  return `${getCmsWorkspaceBasePath(pathname)}/admin`;
}
