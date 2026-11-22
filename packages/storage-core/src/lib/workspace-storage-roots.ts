/** Match RLS lower(segment): preserve whitespace and literal separators. */
export function normalizeWorkspaceStorageRoot(segment: string): string {
  return segment.toLowerCase();
}

/**
 * Roots owned by an application API. Drive never lists or mutates them and
 * the signing mirror never signs them on a user's behalf; the owning API
 * authorizes every access.
 */
const SERVICE_ONLY_ROOTS = new Set([
  'external-apps',
  'external-projects',
  'ai agent imports',
  'project-updates',
  'recordings',
  'template-backgrounds',
  'topic-announcements',
  '.tuturuuu',
]);

/** Service-only roots whose owning API lists them through storage-core. */
export type WorkspaceStorageServiceListingRoot = 'external-projects';

export function isServiceOnlyWorkspaceStorageRoot(
  root: string,
  child?: string
): boolean {
  const normalizedRoot = normalizeWorkspaceStorageRoot(root);
  return (
    SERVICE_ONLY_ROOTS.has(normalizedRoot) ||
    (normalizedRoot === 'mira' &&
      child !== undefined &&
      normalizeWorkspaceStorageRoot(child) === 'images')
  );
}
