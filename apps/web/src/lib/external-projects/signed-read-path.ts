import { sanitizePathSegments } from '@tuturuuu/utils/storage-path';

export function externalProjectSignedReadPath(prefix: string, path: string) {
  const segments = sanitizePathSegments(path, { strict: true });
  if (!segments?.length) return null;
  if (segments[0] === 'finance' || segments[0] === 'user-groups') return null;
  if (segments[0] === 'external-projects') {
    return path.startsWith(`${prefix}/`) ? path : null;
  }
  return `${prefix}/${path}`;
}
