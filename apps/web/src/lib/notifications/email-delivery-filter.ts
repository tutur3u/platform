/** Recheck each email item before rendering; a first-item check misses mixed digests. */
export async function filterEmailDeliveryLogs<T>(
  logs: T[],
  getSkipReason: (log: T) => Promise<string | null>,
  markSkipped: (logs: T[], reason: string) => Promise<void>
): Promise<{ deliverableLogs: T[]; skippedCount: number }> {
  const deliverableLogs: T[] = [];
  const skippedByReason = new Map<string, T[]>();
  for (const log of logs) {
    const reason = await getSkipReason(log);
    if (!reason) {
      deliverableLogs.push(log);
      continue;
    }
    const skipped = skippedByReason.get(reason) ?? [];
    skipped.push(log);
    skippedByReason.set(reason, skipped);
  }
  for (const [reason, skipped] of skippedByReason) {
    await markSkipped(skipped, reason);
  }
  return {
    deliverableLogs,
    skippedCount: logs.length - deliverableLogs.length,
  };
}
