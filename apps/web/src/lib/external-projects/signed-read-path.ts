import {
  sanitizePath,
  sanitizePathSegments,
} from '@tuturuuu/utils/storage-path';

export function externalProjectSignedReadPath(prefix: string, path: string) {
  const sanitized = sanitizePath(path);
  if (!sanitized || sanitized !== path || sanitizePath(prefix) !== prefix)
    return null;
  const segments = sanitizePathSegments(sanitized, { strict: true });
  if (!segments?.length) return null;
  if (segments[0] === 'finance' || segments[0] === 'user-groups') return null;
  if (segments[0] === 'external-projects') {
    return sanitized.startsWith(`${prefix}/`) ? sanitized : null;
  }
  return sanitizePath(`${prefix}/${sanitized}`);
}
