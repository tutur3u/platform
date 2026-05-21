import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { joinPath } from '@tuturuuu/utils/path-helper';

export function getPathSegments(path: string) {
  return path.split('/').filter(Boolean);
}

export function getSelectionKey(path: string, item: StorageObject) {
  return joinPath(path || '/', item.id || item.name || '');
}
