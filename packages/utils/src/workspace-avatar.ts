import { avatarStorageOrigins } from './avatar-storage-origins';

const workspaceId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ticketFilename =
  /^avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function isWorkspaceAvatarPath(value: string, wsId: string) {
  if (wsId.length !== 36 || !workspaceId.test(wsId)) return false;
  const prefix = `workspaces/${wsId}/`;
  if (!value.startsWith(prefix)) return false;
  const filename = value.slice(prefix.length);
  return filename.length === 48 && ticketFilename.test(filename);
}

/** Match the stored string before any URL parsing can normalize ownership away. */
export function ownedWorkspaceAvatarPath(
  value: string | null | undefined,
  wsId: string,
  storageOrigins: readonly (string | undefined)[]
) {
  if (!value) return null;
  for (const origin of avatarStorageOrigins(storageOrigins)) {
    const prefix = `${origin}/storage/v1/object/public/avatars/`;
    if (!value.startsWith(prefix)) continue;
    const path = value.slice(prefix.length);
    if (isWorkspaceAvatarPath(path, wsId)) return path;
  }
  return null;
}
