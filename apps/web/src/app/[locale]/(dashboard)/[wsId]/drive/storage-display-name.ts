import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';

const UUID_PATTERN =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const GENERATED_STORAGE_PREFIX_PATTERN = new RegExp(
  `^(?:${UUID_PATTERN}[-_])+`,
  'i'
);

export function stripGeneratedStorageNamePrefix(name: string) {
  return name.replace(GENERATED_STORAGE_PREFIX_PATTERN, '');
}

export function getStorageObjectDisplayName(item: StorageObject | null) {
  if (!item?.name) {
    return '';
  }

  return stripGeneratedStorageNamePrefix(item.name);
}
