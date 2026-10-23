const ticketFilename =
  /^avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

export function isWorkspaceAvatarPath(value: string, wsId: string) {
  const prefix = `workspaces/${wsId}/`;
  if (!value.startsWith(prefix)) return false;
  const filename = value.slice(prefix.length);
  return filename.length === 48 && ticketFilename.test(filename);
}

/** Match the stored string before any URL parsing can normalize ownership away. */
export function ownedWorkspaceAvatarPath(
  value: string | null | undefined,
  wsId: string,
  storageOrigin: string | undefined
) {
  if (!value || !storageOrigin) return null;
  let origin: string;
  try {
    const configured = new URL(storageOrigin);
    if (
      !['https:', 'http:'].includes(configured.protocol) ||
      configured.username ||
      configured.password ||
      configured.pathname !== '/' ||
      configured.search ||
      configured.hash
    )
      return null;
    origin = configured.origin;
  } catch {
    return null;
  }
  const prefix = `${origin}/storage/v1/object/public/avatars/`;
  if (!value.startsWith(prefix)) return null;
  const path = value.slice(prefix.length);
  return isWorkspaceAvatarPath(path, wsId) ? path : null;
}
