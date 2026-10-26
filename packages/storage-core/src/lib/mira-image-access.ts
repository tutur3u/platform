/**
 * Read access for Mira-generated images (`<wsId>/mira/images/<file>`).
 *
 * `mira/images` stays a service-only root in the bucket RLS mirror
 * (`workspace-storage-access`); members cannot sign these objects directly.
 * Service-role routes may sign one on read for the user who generated it, so
 * chat history renders without persisting long-lived signed URLs.
 *
 * Framework-independent: membership and the generator lookup are injected.
 */

import {
  classifyWorkspaceStoragePath,
  type WorkspaceStorageAccess,
} from './workspace-storage-access';

export interface MiraImageAccessContext {
  userId: string;
  /** MEMBER membership (guests are excluded, matching RLS). */
  isWorkspaceMember(wsId: string): Promise<boolean>;
  /**
   * Whether `userId` generated the image at `name`; the image executor records
   * the generator and `storagePath` on its AI credit transaction.
   */
  isImageGeneratedBy(name: string, userId: string): Promise<boolean>;
}

/** True only for a direct, literal `<wsId>/mira/images/<file>` object name. */
export function isMiraImagePath(name: string): boolean {
  const parts = name.split('/');
  return (
    parts.length === 4 &&
    parts[1] === 'mira' &&
    parts[2] === 'images' &&
    // Rejects empty/dot segments and encoded aliases of another root.
    classifyWorkspaceStoragePath(name)?.kind === 'private'
  );
}

export async function resolveMiraImageReadAccess(
  name: string,
  context: MiraImageAccessContext
): Promise<WorkspaceStorageAccess> {
  if (!isMiraImagePath(name)) return 'invalid';
  const [wsId] = name.split('/');
  if (!wsId || !(await context.isWorkspaceMember(wsId))) return 'forbidden';
  return (await context.isImageGeneratedBy(name, context.userId))
    ? 'allowed'
    : 'forbidden';
}
