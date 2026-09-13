/** Unknown, negative, fractional and unsafe byte limits never grant capacity. */
export function resolveStorageByteLimit(
  value: unknown,
  failed = false
): number {
  if (failed || value === null || value === undefined || value === '') return 0;
  const limit =
    typeof value === 'number' || typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(limit) && limit >= 0 ? limit : 0;
}
export function fitsStorageBudget(
  used: number,
  incoming: number,
  limit: number,
  replaced = 0
): boolean {
  if (
    ![used, incoming, limit, replaced].every(
      (value) => Number.isSafeInteger(value) && value >= 0
    ) ||
    incoming === 0 ||
    replaced > used
  )
    return false;
  const total = used - replaced + incoming;
  return Number.isSafeInteger(total) && total <= limit;
}

/** Missing object metadata must not be counted as zero-cost storage. */
export function readStorageUsageBytes(value: unknown): number {
  const size =
    typeof value === 'number' || (typeof value === 'string' && value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(size) || size < 0)
    throw new Error('Storage usage metadata is unavailable or invalid');
  return size;
}
