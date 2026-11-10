import { sanitizePath } from '@tuturuuu/utils/storage-path';

export const EXTERNAL_PROJECTS_STORAGE_PREFIX = 'external-projects/';

export function isExternalProjectStoragePath(
  path: string | null | undefined
): path is string {
  if (typeof path !== 'string') {
    return false;
  }

  const sanitizedPath = sanitizePath(path);

  return (
    sanitizedPath === path &&
    sanitizedPath.startsWith(EXTERNAL_PROJECTS_STORAGE_PREFIX)
  );
}

export function assertExternalProjectStoragePath(
  path: string | null | undefined,
  fieldName = 'storage_path'
) {
  if (path === null || path === undefined) {
    return path;
  }

  if (!isExternalProjectStoragePath(path)) {
    throw new Error(`${fieldName} must be under external-projects/`);
  }

  return path;
}
