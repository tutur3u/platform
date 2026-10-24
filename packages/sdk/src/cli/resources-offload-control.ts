import { z } from 'zod';

export const OFFLOAD_REQUEST_TIMEOUT_MS = 15_000;

// Abort the transport and settle even if an adapter fails to honor cancellation.
export async function offloadRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  {
    signal,
    timeoutMs = OFFLOAD_REQUEST_TIMEOUT_MS,
  }: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(
    () => controller.abort(new Error('offload request timed out')),
    Math.max(1, timeoutMs)
  );
  let rejectAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', rejectAbort, {
          once: true,
        });
        if (controller.signal.aborted) rejectAbort();
      }),
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return request(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (rejectAbort)
      controller.signal.removeEventListener('abort', rejectAbort);
  }
}

export function offloadPause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export const offloadRunIdSchema = z.object({
  run: z.object({ id: z.string().trim().min(1) }),
});
export const offloadRunSchema = z.object({
  run: z.object({
    id: z.string().trim().min(1),
    status: z.enum([
      'queued',
      'claimed',
      'running',
      'succeeded',
      'failed',
      'cancel_requested',
      'cancelled',
    ]),
    exitCode: z.number().int().nullable().optional(),
  }),
});
export const offloadStopByKeySchema = z.object({
  runId: z.string().trim().min(1),
});
export const offloadLogsSchema = z.object({
  logs: z.array(z.string()),
  next: z.number().int().nonnegative().optional(),
});
