'use server';

import { getLogAggregator } from './realtime-log-aggregator';

/**
 * Server action to add a log entry to the aggregator buffer
 *
 * This function is called from the client-side realtimeLogger.
 * Logs are buffered in memory and flushed to the database every 15 minutes.
 *
 * @param wsId - Workspace ID
 * @param userId - User ID (can be null)
 * @param kind - Log kind/type (e.g., 'info', 'warn', 'error')
 * @param message - Log message
 * @param data - Optional structured data
 */
export async function addRealtimeLog(
  wsId: string,
  userId: string | null,
  kind: string,
  message: string,
  data?: any
): Promise<void> {
  try {
    const aggregator = getLogAggregator();
    aggregator.add({
      wsId,
      userId,
      kind,
      message,
      timestamp: new Date(),
      data,
    });
  } catch (error) {
    console.error('[RealtimeLogAggregator] Failed to add log:', error);
    // Don't throw - logging should never break the application
  }
}

/**
 * Manually trigger a flush (useful for testing or graceful shutdown)
 */
export async function flushRealtimeLogs(): Promise<void> {
  const aggregator = getLogAggregator();
  await aggregator.flush();
}
