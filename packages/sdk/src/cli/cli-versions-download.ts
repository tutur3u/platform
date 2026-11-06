import { createHash } from 'node:crypto';

export const MAX_CLI_DOWNLOAD_BYTES = 64 * 1024 * 1024;
export const CLI_DOWNLOAD_TIMEOUT_MS = 120_000;

export function withAbortSignal<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
    operation.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      }
    );
    if (signal.aborted) abort();
  });
}

export async function withCliDownloadDeadline<T>(
  timeoutMs: number,
  action: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > CLI_DOWNLOAD_TIMEOUT_MS
  )
    throw new Error('Invalid CLI download deadline.');
  const controller = new AbortController();
  const deadline = setTimeout(
    () =>
      controller.abort(
        new DOMException(
          'CLI registry download exceeded its deadline.',
          'TimeoutError'
        )
      ),
    timeoutMs
  );
  try {
    return await action(controller.signal);
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
}

/** Authenticate a bounded HTTP body in memory under the caller's single deadline. */
export async function downloadVerifiedArchive(
  url: string,
  integrity: string,
  {
    fetchImpl = globalThis.fetch,
    signal,
    maxBytes = MAX_CLI_DOWNLOAD_BYTES,
  }: {
    fetchImpl?: typeof fetch;
    signal: AbortSignal;
    maxBytes?: number;
  }
) {
  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > MAX_CLI_DOWNLOAD_BYTES
  )
    throw new Error('Invalid CLI download limit.');
  signal.throwIfAborted();
  const response = await withAbortSignal(
    fetchImpl(url, {
      signal,
      redirect: 'error',
      headers: { 'accept-encoding': 'identity' },
    }),
    signal
  );
  const length = response.headers.get('content-length');
  if (
    !response.ok ||
    (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxBytes))
  ) {
    await withAbortSignal(
      response.body?.cancel() ?? Promise.resolve(),
      signal
    ).catch(() => undefined);
    if (!response.ok)
      throw new Error(`Downloading CLI archive failed (${response.status}).`);
    throw new Error('CLI archive exceeds the download size limit.');
  }
  if (!response.body) throw new Error('CLI archive response has no body.');
  const reader = response.body.getReader();
  try {
    const hash = createHash('sha512');
    let size = 0;
    // Grow one bounded buffer instead of retaining an unbounded number of tiny chunks.
    let bytes = Buffer.alloc(Math.min(maxBytes, 64 * 1024));
    while (true) {
      const chunk = await withAbortSignal(reader.read(), signal);
      if (chunk.done) break;
      if (chunk.value.byteLength > maxBytes - size)
        throw new Error('CLI archive exceeds the download size limit.');
      const nextSize = size + chunk.value.byteLength;
      if (nextSize > bytes.length) {
        const grown = Buffer.alloc(
          Math.min(maxBytes, Math.max(nextSize, bytes.length * 2))
        );
        bytes.copy(grown, 0, 0, size);
        bytes = grown;
      }
      bytes.set(chunk.value, size);
      hash.update(bytes.subarray(size, nextSize));
      size = nextSize;
    }
    if (`sha512-${hash.digest('base64')}` !== integrity)
      throw new Error(
        'CLI archive failed its registry integrity check; nothing was installed.'
      );
    return bytes.subarray(0, size);
  } catch (error) {
    await withAbortSignal(reader.cancel(), signal).catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
