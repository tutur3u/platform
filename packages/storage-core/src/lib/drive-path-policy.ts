import { sanitizePath } from '@tuturuuu/utils/storage-path';
import {
  filterReservedMobileDeploymentDriveEntries,
  isReservedMobileDeploymentDrivePath,
} from './mobile-deployment/storage-policy';

/** Chat resources require their owning chat/thread API, never Drive permissions. */
export function isPrivateChatStoragePath(path: string): boolean {
  const sanitized = sanitizePath(path);
  if (sanitized === null) return true;
  // Match encoded aliases conservatively; transport encoding must not select
  // a different authorization policy from the literal storage namespace.
  let root = sanitized.split('/')[0] ?? '';
  for (let pass = 0; pass < 5; pass += 1) {
    const decoded = root.replace(/%([\da-f]{2})/gi, (_match, byte: string) =>
      String.fromCharCode(Number.parseInt(byte, 16))
    );
    if (decoded === root) break;
    root = decoded;
  }
  return root === 'chats' || root === 'external-apps';
}

export function isExcludedDrivePath(wsId: string, path: string): boolean {
  return (
    isPrivateChatStoragePath(path) ||
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
      !isPrivateChatStoragePath(path ? `${path}/${entry.name}` : entry.name)
  );
}
