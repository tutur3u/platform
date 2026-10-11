export const savedLibraryOrders = ['newest', 'oldest', 'title'] as const;
export type SavedLibraryOrder = (typeof savedLibraryOrders)[number];

const savedTime = (value: string) => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/** Sort a copy of the current authorized projection, preserving ties. */
export function orderSavedLibrary<T extends { savedAt: string }>(
  items: readonly T[],
  order: SavedLibraryOrder,
  publishedTitle: (item: T) => string | null
): T[] {
  return [...items].sort((left, right) => {
    if (order === 'title') {
      const a = publishedTitle(left)?.normalize('NFKC').toLowerCase() ?? null;
      const b = publishedTitle(right)?.normalize('NFKC').toLowerCase() ?? null;
      if (a === null) return b === null ? 0 : 1;
      if (b === null) return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    }
    const a = savedTime(left.savedAt);
    const b = savedTime(right.savedAt);
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return order === 'oldest' ? a - b : b - a;
  });
}
