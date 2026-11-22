import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';

/** Sorting and search helpers shared by the workspace storage listings. */

export type WorkspaceStorageSortBy =
  | 'name'
  | 'created_at'
  | 'updated_at'
  | 'size';

export function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortStorageObjects(
  entries: StorageObject[],
  sortBy: WorkspaceStorageSortBy,
  sortOrder: 'asc' | 'desc'
) {
  const factor = sortOrder === 'asc' ? 1 : -1;

  return [...entries].sort((left, right) => {
    const leftFolder = !left.id;
    const rightFolder = !right.id;

    if (leftFolder !== rightFolder) {
      return leftFolder ? -1 : 1;
    }

    if (sortBy === 'size') {
      return (
        factor *
        (toNumber(left.metadata?.size) - toNumber(right.metadata?.size))
      );
    }

    if (sortBy === 'created_at' || sortBy === 'updated_at') {
      const leftValue =
        new Date(
          sortBy === 'created_at'
            ? (left.created_at ?? 0)
            : (left.updated_at ?? 0)
        ).getTime() || 0;
      const rightValue =
        new Date(
          sortBy === 'created_at'
            ? (right.created_at ?? 0)
            : (right.updated_at ?? 0)
        ).getTime() || 0;

      return factor * (leftValue - rightValue);
    }

    return factor * (left.name ?? '').localeCompare(right.name ?? '');
  });
}

export function matchesSearch(name: string | undefined, search?: string) {
  const normalizedSearch = search?.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return (name ?? '').toLowerCase().includes(normalizedSearch);
}
