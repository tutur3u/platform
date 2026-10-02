import 'server-only';

import { reserveStorageDownloadBudget } from './storage-download-budget';
import { resolveStorageDownloadRange } from './storage-download-range';
import {
  readStorageDownloadTicket,
  StorageDownloadError,
} from './storage-download-token';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  // Uploaded HTML/SVG must not gain the web app's origin privileges.
  'Content-Security-Policy': "sandbox; default-src 'none'",
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Retry-After',
};

function failure(error: unknown) {
  const known = error instanceof StorageDownloadError;
  return Response.json(
    { message: known ? error.message : 'Storage download unavailable' },
    {
      status: known ? error.status : 502,
      headers: {
        ...PRIVATE_HEADERS,
        ...(known && error.retryAfter
          ? { 'Retry-After': String(error.retryAfter) }
          : {}),
      },
    }
  );
}

function contentLength(response: Response) {
  const raw = response.headers.get('content-length');
  const size = Number(raw);
  if (raw === null || !/^\d+$/u.test(raw) || !Number.isSafeInteger(size)) {
    throw new StorageDownloadError('Unable to determine download size', 502);
  }
  return size;
}

function responseHeaders(response: Response) {
  const headers = new Headers(PRIVATE_HEADERS);
  for (const name of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
  ]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function relayStorageDownload(request: Request, token: string) {
  let abort: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cleanup: (() => void) | undefined;
  let objectSize: number | undefined;
  try {
    const ticket = readStorageDownloadTicket(token);
    const range = request.headers.get('range');
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/u.test(range)) {
      throw new StorageDownloadError('Only one byte range is supported', 416);
    }
    await reserveStorageDownloadBudget(ticket);
    abort = new AbortController();
    const controller = abort;
    const resetIdleTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(), 120_000);
    };
    resetIdleTimeout();
    const abortOnDisconnect = () => controller.abort();
    if (request.signal.aborted) controller.abort();
    request.signal.addEventListener('abort', abortOnDisconnect, { once: true });
    const finish = () => {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', abortOnDisconnect);
    };
    cleanup = finish;
    const options: RequestInit = {
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Accept-Encoding': 'identity' },
    };
    // Inspect without downloading bytes; ranges reserve their exact span.
    const head = await fetch(ticket.url, { ...options, method: 'HEAD' });
    if (!head.ok) {
      finish();
      throw new StorageDownloadError(
        'Storage object unavailable',
        head.status === 404 ? 404 : 502
      );
    }
    objectSize = contentLength(head);
    const resolvedRange = range
      ? resolveStorageDownloadRange(range, objectSize)
      : undefined;
    const reservedBytes = resolvedRange?.bytes ?? objectSize;
    if (request.method === 'HEAD') {
      finish();
      return new Response(null, { headers: responseHeaders(head) });
    }
    await reserveStorageDownloadBudget(ticket, reservedBytes);
    resetIdleTimeout();
    const upstream = await fetch(ticket.url, {
      ...options,
      headers: {
        ...options.headers,
        ...(resolvedRange ? { Range: resolvedRange.header } : {}),
      },
    });
    if (upstream.status === 416) {
      controller.abort();
      finish();
      throw new StorageDownloadError('Range not satisfiable', 416);
    }
    if (
      (resolvedRange &&
        (upstream.status !== 206 ||
          upstream.headers.get('content-range') !==
            resolvedRange.contentRange ||
          contentLength(upstream) !== reservedBytes)) ||
      !upstream.ok ||
      !upstream.body ||
      contentLength(upstream) > reservedBytes ||
      (upstream.headers.get('content-encoding') &&
        upstream.headers.get('content-encoding') !== 'identity')
    ) {
      controller.abort();
      finish();
      throw new StorageDownloadError(
        'Storage object unavailable',
        upstream.status === 404 ? 404 : 502
      );
    }
    const reader = upstream.body.getReader();
    let delivered = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(stream) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            finish();
            stream.close();
            return;
          }
          delivered += value.byteLength;
          if (delivered > reservedBytes) {
            controller.abort();
            await reader.cancel();
            throw new Error('Storage body exceeded reservation');
          }
          resetIdleTimeout();
          stream.enqueue(value);
        } catch {
          controller.abort();
          finish();
          stream.error(new Error('Storage download interrupted'));
        }
      },
      async cancel() {
        controller.abort();
        finish();
        await reader.cancel();
      },
    });
    return new Response(body, {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  } catch (error) {
    abort?.abort();
    cleanup?.();
    clearTimeout(timeout);
    const response = failure(error);
    if (response.status === 416 && objectSize !== undefined)
      response.headers.set('Content-Range', `bytes */${objectSize}`);
    return response;
  }
}
