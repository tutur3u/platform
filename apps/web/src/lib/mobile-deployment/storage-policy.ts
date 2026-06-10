import { posix } from 'node:path';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { MOBILE_DEPLOYMENT_DRIVE_PREFIX } from './constants';

function normalizeRelativePath(path: string) {
  return path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

export function buildMobileDeploymentVaultStoragePath(
  versionId: string,
  filename: string
) {
  return posix.join(MOBILE_DEPLOYMENT_DRIVE_PREFIX, versionId, filename);
}

export function isReservedMobileDeploymentDrivePath(
  wsId: string,
  path: string
) {
  if (resolveWorkspaceId(wsId) !== ROOT_WORKSPACE_ID) {
    return false;
  }

  const normalizedPath = normalizeRelativePath(path);
  return (
    normalizedPath === MOBILE_DEPLOYMENT_DRIVE_PREFIX ||
    normalizedPath.startsWith(`${MOBILE_DEPLOYMENT_DRIVE_PREFIX}/`) ||
    Boolean(
      normalizedPath &&
        MOBILE_DEPLOYMENT_DRIVE_PREFIX.startsWith(`${normalizedPath}/`)
    )
  );
}

export function filterReservedMobileDeploymentDriveEntries<
  T extends { name?: string | null },
>(wsId: string, path: string, entries: T[]) {
  if (
    resolveWorkspaceId(wsId) !== ROOT_WORKSPACE_ID ||
    normalizeRelativePath(path)
  ) {
    return entries;
  }

  return entries.filter((entry) => entry.name !== '.tuturuuu');
}
