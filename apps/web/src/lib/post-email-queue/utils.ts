import type { PostEmailQueueRow } from './types';

export const POST_EMAIL_QUERY_CHUNK_SIZE = 500;

export function isValidEmailAddress(
  email: string | null | undefined
): email is string {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

export function summarizePostEmailQueue(
  rows: Array<Pick<PostEmailQueueRow, 'status'>>
) {
  const counts = {
    queued: 0,
    processing: 0,
    sent: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
    skipped: 0,
  };

  for (const row of rows) {
    switch (row.status) {
      case 'queued':
        counts.queued++;
        break;
      case 'processing':
        counts.processing++;
        break;
      case 'sent':
        counts.sent++;
        break;
      case 'failed':
        counts.failed++;
        break;
      case 'blocked':
        counts.blocked++;
        break;
      case 'cancelled':
        counts.cancelled++;
        break;
      case 'skipped':
        counts.skipped++;
        break;
      default:
        break;
    }
  }

  return counts;
}

export function prioritizePostEmailQueueBatch(
  queuedRows: PostEmailQueueRow[],
  failedRows: PostEmailQueueRow[],
  limit: number
) {
  return queuedRows.concat(failedRows).slice(0, Math.max(1, limit));
}

export function chunkArray<T>(
  values: T[],
  chunkSize = POST_EMAIL_QUERY_CHUNK_SIZE
): T[][] {
  if (values.length === 0) return [];

  const safeChunkSize = Math.max(1, chunkSize);
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += safeChunkSize) {
    chunks.push(values.slice(i, i + safeChunkSize));
  }
  return chunks;
}

export async function processWithConcurrency(
  items: PostEmailQueueRow[],
  processor: (
    row: PostEmailQueueRow
  ) => Promise<{ id: string; status: string }>,
  onError: (
    row: PostEmailQueueRow,
    error: Error
  ) => Promise<{ id: string; status: string }> | { id: string; status: string },
  concurrency: number,
  maxDurationMs: number,
  startTime: number
): Promise<{
  results: Array<{ id: string; status: string }>;
  timedOut: boolean;
}> {
  const results: Array<{ id: string; status: string }> = [];
  let timedOut = false;

  for (let i = 0; i < items.length; i += concurrency) {
    if (Date.now() - startTime > maxDurationMs) {
      timedOut = true;
      break;
    }

    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((row) =>
        processor(row).catch((error) => {
          const normalizedError =
            error instanceof Error ? error : new Error('Unknown error');
          return Promise.resolve(onError(row, normalizedError));
        })
      )
    );
    results.push(...batchResults);
  }

  return { results, timedOut };
}
