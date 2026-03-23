import { POST_EMAIL_QUEUE_STATUSES } from './constants';
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
  const counts = POST_EMAIL_QUEUE_STATUSES.reduce<
    Record<(typeof POST_EMAIL_QUEUE_STATUSES)[number], number>
  >(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<(typeof POST_EMAIL_QUEUE_STATUSES)[number], number>
  );

  for (const row of rows) {
    if (Object.hasOwn(counts, row.status)) {
      counts[row.status as keyof typeof counts]++;
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
