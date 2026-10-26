import { sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  filterReservedMobileDeploymentDriveEntries,
  isReservedMobileDeploymentDrivePath,
} from './mobile-deployment/storage-policy';

/** Private resources require their owning application API, never Drive permissions. */
function isPrivateAppStoragePath(path: string): boolean {
  const sanitized = sanitizePath(path);
  if (sanitized === null) return true;
  // Match encoded aliases conservatively; transport encoding must not select
  // a different authorization policy from the literal storage namespace.
  let namespace = sanitized.split('/').slice(0, 2).join('/');
  for (let pass = 0; pass < 5; pass += 1) {
    const decoded = namespace.replace(
      /%([\da-f]{2})/gi,
      (_match, byte: string) => String.fromCharCode(Number.parseInt(byte, 16))
    );
    if (decoded === namespace) break;
    namespace = decoded;
  }
  const [root, child] = namespace.split('/');
  return (
    [
      'chat',
      'chats',
      'external-apps',
      'AI Agent Imports',
      'recordings',
    ].includes(root ?? '') ||
    (root === 'mira' && child === 'images')
  );
}

export function isExcludedDrivePath(wsId: string, path: string): boolean {
  return (
    isPrivateAppStoragePath(path) ||
    isReservedMobileDeploymentDrivePath(wsId, path)
  );
}

export function filterDriveEntries<T extends { name?: string | null }>(
  wsId: string,
  path: string,
  entries: T[]
): T[] {
  return filterReservedMobileDeploymentDriveEntries(wsId, path, entries).filter(
    (entry) =>
      !entry.name ||
      !isPrivateAppStoragePath(path ? `${path}/${entry.name}` : entry.name)
  );
}
