import type { Json } from '@tuturuuu/types';
import { createAdminClient } from './server';

interface LogEntry {
  wsId: string;
  userId: string | null;
  kind: string;
  message: string;
  timestamp: Date;
  data?: any;
}

interface AggregatedLog {
  ws_id: string;
  user_id: string | null;
  channel_id: string | null;
  time_bucket: string;
  kind: string;
  total_count: number;
  error_count: number;
  sample_messages: string[];
}

/**
 * RealtimeLogAggregator buffers logs in memory and flushes aggregated metrics
 * to the database at regular intervals (default: 15 minutes).
 *
 * This reduces database writes by ~99% while maintaining queryable metrics.
 *
 * Features:
 * - 15-minute time buckets for aggregation
 * - Automatic periodic flushing
 * - Memory overflow protection (force flush at 1000 entries)
 * - Samples 10 representative messages per bucket
 * - Tracks unique users and error counts
 */
class RealtimeLogAggregator {
  private buffer: Map<string, LogEntry[]> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;

  // Configuration
  private readonly BUCKET_SIZE_MINUTES = 1; // Time bucket size
  private readonly FLUSH_INTERVAL_MS = this.BUCKET_SIZE_MINUTES * 60 * 1000;
  private readonly MAX_BUFFER_SIZE = 1000; // Prevent memory overflow
  private readonly SAMPLE_SIZE = 10; // Keep 10 sample messages per bucket

  constructor() {
    this.startFlushTimer();
  }

  /**
   * Extract channel ID from realtime messages
   * Supports formats:
   * - "realtime:board-cursor-xxx ..."
   * - "ok realtime:board-cursor-xxx ..."
   */
  private getChannelID(message: string): string | null {
    const match = message.match(/(?:ok )?realtime:([^\s]+)/);
    return match?.[1] ?? null;
  }

  /**
   * Generate a unique key for a time bucket
   * Format: "wsId::userId::channelId::kind::ISO8601_timestamp"
   * Using :: as delimiter to avoid conflicts with underscores in kind field
   */
  private getBucketKey(
    wsId: string,
    userId: string | null,
    kind: string,
    message: string,
    timestamp: Date
  ): string {
    const channelId = this.getChannelID(message);
    const bucketTime = this.roundToTimeBucket(timestamp);
    return `${wsId}::${userId ?? 'null'}::${channelId ?? 'null'}::${kind}::${bucketTime.toISOString()}`;
  }

  /**
   * Round timestamp down to the nearest 15-minute bucket
   */
  private roundToTimeBucket(timestamp: Date): Date {
    const bucketTime = new Date(timestamp);
    const minutes = bucketTime.getMinutes();
    const roundedMinutes =
      Math.floor(minutes / this.BUCKET_SIZE_MINUTES) * this.BUCKET_SIZE_MINUTES;

    bucketTime.setMinutes(roundedMinutes);
    bucketTime.setSeconds(0);
    bucketTime.setMilliseconds(0);

    return bucketTime;
  }

  /**
   * Add a log entry to the buffer
   * Automatically flushes if buffer exceeds MAX_BUFFER_SIZE
   */
  add(entry: LogEntry): void {
    const bucketKey = this.getBucketKey(
      entry.wsId,
      entry.userId,
      entry.kind,
      entry.message,
      entry.timestamp
    );

    if (!this.buffer.has(bucketKey)) {
      this.buffer.set(bucketKey, []);
    }

    const bucket = this.buffer.get(bucketKey)!;
    bucket.push(entry);

    // Force flush if buffer is too large
    if (this.getTotalBufferSize() >= this.MAX_BUFFER_SIZE) {
      console.log(
        `[RealtimeLogAggregator] Buffer size exceeded ${this.MAX_BUFFER_SIZE}, forcing flush`
      );
      this.flush();
    }
  }

  /**
   * Get total number of buffered log entries
   */
  private getTotalBufferSize(): number {
    return Array.from(this.buffer.values()).reduce(
      (sum, logs) => sum + logs.length,
      0
    );
  }

  /**
   * Start the periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL_MS);

    // Ensure timer doesn't prevent process exit in Node.js
    if (this.flushInterval.unref) {
      this.flushInterval.unref();
    }
  }

  /**
   * Flush all buffered logs to the database as aggregated metrics
   */
  async flush(): Promise<void> {
    if (this.buffer.size === 0) {
      return;
    }

    const bufferedCount = this.getTotalBufferSize();
    const bucketCount = this.buffer.size;

    console.log(
      `[RealtimeLogAggregator] Flushing ${bufferedCount} logs across ${bucketCount} buckets`
    );

    try {
      const aggregatedLogs = this.aggregateBufferedLogs();
      await this.saveToDB(aggregatedLogs);

      console.log(
        `[RealtimeLogAggregator] Successfully flushed ${aggregatedLogs.length} aggregated entries`
      );

      this.buffer.clear();
    } catch (error) {
      console.error('[RealtimeLogAggregator] Flush failed:', error);
      // Keep buffer for retry on next flush
    }
  }

  /**
   * Transform buffered logs into aggregated metrics
   */
  private aggregateBufferedLogs(): AggregatedLog[] {
    const aggregated: AggregatedLog[] = [];

    for (const [bucketKey, logs] of this.buffer.entries()) {
      // Try new delimiter first (::)
      const parts = bucketKey.split('::');

      // Migration path: handle old delimiter (_) entries
      if (parts.length !== 5) {
        console.warn(
          `[RealtimeLogAggregator] Invalid bucket key format with :: delimiter (expected 5 parts, got ${parts.length}), skipping: ${bucketKey}`
        );
        // Skip malformed entries to prevent database errors
        continue;
      }

      const [wsId, userId, channelId, kind, timeBucket] = parts;

      // Validate all required fields
      if (!wsId || !kind || !timeBucket) {
        console.warn(
          `[RealtimeLogAggregator] Invalid bucket key values (missing required fields), skipping: ${bucketKey}`
        );
        continue;
      }

      // Validate wsId is a valid UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(wsId)) {
        console.warn(
          `[RealtimeLogAggregator] Invalid wsId format (not a UUID), skipping: ${wsId} in ${bucketKey}`
        );
        continue;
      }

      // Validate timeBucket is a valid ISO timestamp
      const parsedDate = new Date(timeBucket);
      if (Number.isNaN(parsedDate.getTime())) {
        console.warn(
          `[RealtimeLogAggregator] Invalid timeBucket format (not a valid date), skipping: ${timeBucket} in ${bucketKey}`
        );
        continue;
      }

      // Count errors (kind contains 'error')
      const errorCount = logs.filter((l) =>
        l.kind.toLowerCase().includes('error')
      ).length;

      // Sample messages: take first 5 and last 5 for variety
      const halfSample = Math.floor(this.SAMPLE_SIZE / 2);
      const sampleMessages = [
        ...logs.slice(0, halfSample),
        ...logs.slice(-halfSample),
      ].map((l) => l.message);

      // Deduplicate sample messages
      const uniqueSampleMessages = [...new Set(sampleMessages)];

      aggregated.push({
        ws_id: wsId,
        user_id: userId === 'null' ? null : (userId ?? null),
        channel_id: channelId === 'null' ? null : (channelId ?? null),
        time_bucket: timeBucket,
        kind: kind,
        total_count: logs.length,
        error_count: errorCount,
        sample_messages: uniqueSampleMessages,
      });
    }

    return aggregated;
  }

  /**
   * Save aggregated logs to database
   * Uses upsert with additive count on conflict to accumulate metrics
   */
  private async saveToDB(aggregatedLogs: AggregatedLog[]): Promise<void> {
    if (aggregatedLogs.length === 0) {
      return;
    }

    const sbAdmin = await createAdminClient();

    // Use raw SQL upsert with additive count on conflict
    const { error } = await sbAdmin.rpc('upsert_realtime_log_aggregations', {
      p_logs: aggregatedLogs as unknown as Json[],
    });

    if (error) {
      console.error(error);
      throw new Error(
        `[RealtimeLogAggregator] Failed to save aggregated logs: ${error.message}`
      );
    }
  }

  /**
   * Cleanup: stop timer and flush remaining logs
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    // Final flush (don't await to prevent blocking shutdown)
    this.flush();
  }
}

// Singleton instance
let aggregatorInstance: RealtimeLogAggregator | null = null;

/**
 * Get or create the singleton log aggregator instance
 * This is synchronous and safe to call from anywhere
 */
export function getLogAggregator(): RealtimeLogAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new RealtimeLogAggregator();

    // Setup graceful shutdown handlers
    if (typeof process !== 'undefined') {
      const cleanup = () => {
        if (aggregatorInstance) {
          console.log('[RealtimeLogAggregator] Shutting down...');
          aggregatorInstance.destroy();
          aggregatorInstance = null;
        }
      };

      process.on('SIGTERM', cleanup);
      process.on('SIGINT', cleanup);
      process.on('beforeExit', cleanup);
    }
  }

  return aggregatorInstance;
}
