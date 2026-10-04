export class InventorySeasonMergedError extends Error {
  constructor() {
    super('Sales period was merged; refresh and select its destination');
    this.name = 'InventorySeasonMergedError';
  }
}
export function isInventorySeasonMergedError(error: unknown): boolean {
  if (error instanceof InventorySeasonMergedError) return true;
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23514' &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.startsWith('Sales period was merged;')
  );
}
