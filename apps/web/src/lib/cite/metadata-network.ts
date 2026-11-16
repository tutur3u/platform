import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIPv4 } from 'node:net';
import { Agent, type Dispatcher, fetch as undiciFetch } from 'undici';

export const METADATA_MAX_BYTES = 256 * 1024;
export const METADATA_TIMEOUT_MS = 5000;
export const WEBPAGE_HOSTS = new Set([
  'en.wikipedia.org',
  'www.nature.com',
  'arxiv.org',
]);

export class CitationLookupError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_INPUT'
      | 'NOT_FOUND'
      | 'UPSTREAM_ERROR'
      | 'TIMEOUT'
      | 'RESPONSE_TOO_LARGE',
    public readonly status: number
  ) {
    super(code);
  }
}

type MetadataFetch = (
  url: URL,
  init: {
    dispatcher: Dispatcher;
    headers: Record<string, string>;
    redirect: 'manual';
    signal: AbortSignal;
  }
) => Promise<Pick<Response, 'ok' | 'status' | 'headers' | 'body'>>;

export interface MetadataNetwork {
  resolve: (hostname: string) => Promise<{ address: string; family: number }[]>;
  dispatcher: (address: string, hostname: string) => Dispatcher;
  fetch: MetadataFetch;
  timeoutMs?: number;
}

const defaultNetwork: MetadataNetwork = {
  resolve: (hostname) => lookup(hostname, { all: true, family: 4 }),
  dispatcher: (address, hostname) =>
    new Agent({
      connect: {
        servername: hostname,
        lookup: (requestedHostname, options, callback) => {
          if (requestedHostname !== hostname) {
            callback(new Error('Metadata hostname mismatch'), '', 4);
            return;
          }
          if (options.all) callback(null, [{ address, family: 4 }]);
          else callback(null, address, 4);
        },
      },
    }),
  // undici and DOM Response use separate declaration packages for the same web API.
  fetch: undiciFetch as unknown as MetadataFetch,
};

/** Only globally routable IPv4 is admitted; IPv6 is deliberately unsupported. */
export function isGlobalMetadataAddress(address: string) {
  if (!isIPv4(address)) return false;
  const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal?: AbortSignal
) {
  if (!body) return '';
  const reader = body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new CitationLookupError('TIMEOUT', 504);
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes)
        throw new CitationLookupError('RESPONSE_TOO_LARGE', 413);
      text += decoder.decode(value, { stream: true });
    }
    if (signal?.aborted) throw new CitationLookupError('TIMEOUT', 504);
    return text + decoder.decode();
  } finally {
    signal?.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
}

/** One request, no redirects or retries; DNS, headers and decoded body share a deadline. */
export async function fetchMetadataText(
  url: URL,
  kind: 'json' | 'html',
  network: MetadataNetwork = defaultNetwork,
  limits: { deadline?: number; maxBytes?: number; signal?: AbortSignal } = {}
) {
  if (limits.signal?.aborted)
    throw new DOMException('Citation lookup aborted', 'AbortError');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !new Set([
      'api.crossref.org',
      'openlibrary.org',
      'api.openalex.org',
      ...WEBPAGE_HOSTS,
    ]).has(url.hostname)
  )
    throw new CitationLookupError('INVALID_INPUT', 400);

  const timeoutMs = Math.min(
    network.timeoutMs ?? METADATA_TIMEOUT_MS,
    limits.deadline === undefined
      ? METADATA_TIMEOUT_MS
      : limits.deadline - Date.now()
  );
  if (timeoutMs <= 0) throw new CitationLookupError('TIMEOUT', 504);
  const maxBytes = Math.min(
    limits.maxBytes ?? METADATA_MAX_BYTES,
    METADATA_MAX_BYTES
  );
  if (maxBytes <= 0) throw new CitationLookupError('RESPONSE_TOO_LARGE', 502);

  const controller = new AbortController();
  let dispatcher: Dispatcher | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CitationLookupError('TIMEOUT', 504));
    }, timeoutMs);
  });
  let onCallerAbort = () => {};
  const cancellation = new Promise<never>((_, reject) => {
    onCallerAbort = () => {
      controller.abort();
      reject(new DOMException('Citation lookup aborted', 'AbortError'));
    };
    limits.signal?.addEventListener('abort', onCallerAbort, { once: true });
    if (limits.signal?.aborted) onCallerAbort();
  });
  const work = async () => {
    const records = await network.resolve(url.hostname);
    if (controller.signal.aborted)
      throw new CitationLookupError('TIMEOUT', 504);
    const first = records[0];
    if (
      !first ||
      records.some(
        ({ address, family }) =>
          family !== 4 || !isGlobalMetadataAddress(address)
      )
    ) {
      throw new CitationLookupError('UPSTREAM_ERROR', 502);
    }
    dispatcher = network.dispatcher(first.address, url.hostname);
    const response = await network.fetch(url, {
      dispatcher,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: kind === 'json' ? 'application/json' : 'text/html',
        'User-Agent': 'Tuturuuu-Cite/1.0',
        Host: url.hostname,
      },
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CitationLookupError(
        response.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
        response.status === 404 ? 404 : 502
      );
    }
    const contentType =
      response.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() ?? '';
    if (contentType !== (kind === 'json' ? 'application/json' : 'text/html')) {
      await response.body?.cancel().catch(() => undefined);
      throw new CitationLookupError('UPSTREAM_ERROR', 502);
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new CitationLookupError('RESPONSE_TOO_LARGE', 502);
    }
    return readBoundedText(response.body, maxBytes, controller.signal);
  };
  try {
    return await Promise.race([work(), deadline, cancellation]);
  } catch (error) {
    if (limits.signal?.aborted)
      throw new DOMException('Citation lookup aborted', 'AbortError');
    if (error instanceof CitationLookupError) throw error;
    throw new CitationLookupError('UPSTREAM_ERROR', 502);
  } finally {
    clearTimeout(timer);
    limits.signal?.removeEventListener('abort', onCallerAbort);
    controller.abort();
    void dispatcher?.destroy().catch(() => undefined);
  }
}
