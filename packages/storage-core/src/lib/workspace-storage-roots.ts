/** Match RLS lower(segment): preserve whitespace and literal separators. */
export function normalizeWorkspaceStorageRoot(segment: string): string {
  return segment.toLowerCase();
}

const SERVICE_ONLY_ROOTS = new Set([
  'external-apps',
  'ai agent imports',
  'recordings',
  'topic-announcements',
  '.tuturuuu',
]);

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
