import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';

/**
 * Why a destination cannot take the moving entries, or null when it can: the
 * entries already live there, or a moving folder would land in itself or a
 * descendant.
 */
export function getMoveTargetBlock(
  sourcePath: string,
  destinationPath: string,
  items: StorageObject[]
): 'same' | 'inside' | null {
  if (destinationPath === sourcePath) return 'same';

  for (const item of items) {
    if (item.id || !item.name) continue;
    const folderPath = sourcePath ? `${sourcePath}/${item.name}` : item.name;
    if (
      destinationPath === folderPath ||
      destinationPath.startsWith(`${folderPath}/`)
    ) {
      return 'inside';
    }
  }

  return null;
}
