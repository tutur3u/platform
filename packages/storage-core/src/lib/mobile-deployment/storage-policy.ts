import { posix } from 'node:path';
import {
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { sanitizePathStrict } from '@tuturuuu/utils/storage-path';
import { MOBILE_DEPLOYMENT_DRIVE_PREFIX } from './constants';

function normalizeRelativePath(path: string) {
  if (sanitizePathStrict(path) === null) return null;
  let normalized = path.replaceAll('\\', '/').trim();
  for (let pass = 0; pass < 5; pass += 1) {
    const decoded = normalized.replace(
      /%([\da-f]{2})/gi,
      (_match, byte: string) => String.fromCharCode(Number.parseInt(byte, 16))
    );
    if (decoded === normalized) break;
    normalized = decoded;
  }
  return normalized.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
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
  if (normalizedPath === null) return true;

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
  if (resolveWorkspaceId(wsId) !== ROOT_WORKSPACE_ID) return entries;
  const normalizedPath = normalizeRelativePath(path);
  if (normalizedPath !== null && normalizedPath !== '') return entries;

  return entries.filter((entry) => entry.name !== '.tuturuuu');
}
