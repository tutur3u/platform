import { sanitizePathStrict } from './storage-path';

/**
 * Storage folder that board-template background uploads are written to,
 * relative to the owning workspace root in the `workspaces` bucket.
 */
export const TEMPLATE_BACKGROUND_FOLDER = 'template-backgrounds';

export function getTemplateBackgroundPrefix(wsId: string) {
  return `${wsId}/${TEMPLATE_BACKGROUND_FOLDER}/`;
}

/**
 * Whether `path` is a board-template background object owned by `wsId`.
 *
 * Template background paths are signed with the service-role storage client,
 * so a stored path must stay inside the template workspace's
 * `template-backgrounds/` folder. Validate before writing a path and again
 * before signing one.
 */
export function isWorkspaceTemplateBackgroundPath(
  path: unknown,
  wsId: string | null | undefined
): path is string {
  if (typeof path !== 'string' || !wsId) return false;

  const prefix = getTemplateBackgroundPrefix(wsId);
  return (
    path.length > prefix.length &&
    path.startsWith(prefix) &&
    sanitizePathStrict(path) === path
  );
}
