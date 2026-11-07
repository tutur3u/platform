const BODY_LIMIT = 8 * 1024 * 1024;
const TIMEOUT_MS = 8_000;
const REQUEST_HEADERS = ['accept', 'accept-language'];
const RESPONSE_HEADERS = [
  'content-type',
  'content-language',
  'etag',
  'last-modified',
];
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function isRoadmapPath(pathname: string): boolean {
  return pathname === '/roadmap' || pathname.startsWith('/roadmap/');
}

function privateHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
}

function failure(status: number): Response {
  return new Response(null, { status, headers: privateHeaders() });
}

function parseOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      /^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
      ? url
      : null;
  } catch {
    return null;
  }
}

export async function serveRoadmap({
  request,
  origin,
  fetcher = fetch,
}: {
  request: Request;
  origin: string;
  fetcher?: typeof fetch;
}): Promise<Response> {
  const incoming = new URL(request.url);
  if (!isRoadmapPath(incoming.pathname)) return failure(404);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const response = failure(405);
    response.headers.set('Allow', 'GET, HEAD');
    return response;
  }
  const fixedOrigin = parseOrigin(origin);
  if (!fixedOrigin) return failure(503);
  if (incoming.pathname === '/roadmap') {
    const headers = privateHeaders();
    headers.set('Location', `/roadmap/${incoming.search}`);
    return new Response(null, { status: 308, headers });
  }
  const target = new URL(fixedOrigin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  if (!isRoadmapPath(target.pathname) || /%2f|%5c/i.test(target.pathname)) {
    return failure(502);
  }

  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const perform = async (): Promise<Response> => {
    const headers = new Headers({ 'Accept-Encoding': 'identity' });
    for (const name of REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value && value.length <= 1024) headers.set(name, value);
    }
    const upstream = await fetcher(target, {
      method: request.method,
      headers,
      redirect: 'manual',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    reader = upstream.body?.getReader();
    if (controller.signal.aborted) {
      void reader?.cancel().catch(() => {});
      throw new Error('Request aborted');
    }
    const outputHeaders = privateHeaders();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) outputHeaders.set(name, value);
    }
    if (REDIRECT_STATUSES.has(upstream.status)) {
      const location = upstream.headers.get('location');
      if (!location) throw new Error('Missing redirect target');
      const destination = new URL(location, target);
      if (
        destination.origin !== fixedOrigin.origin ||
        !isRoadmapPath(destination.pathname) ||
        destination.username ||
        destination.password ||
        /%2f|%5c/i.test(destination.pathname)
      ) {
        throw new Error('Disallowed redirect target');
      }
      outputHeaders.set(
        'Location',
        destination.pathname + destination.search + destination.hash
      );
    }
    if (upstream.status >= 500 || upstream.status < 200) {
      throw new Error('Upstream failure');
    }
    const declaredLength = upstream.headers.get('content-length');
    if (
      declaredLength &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) > BODY_LIMIT)
    ) {
      throw new Error('Response exceeds limit');
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (request.method !== 'HEAD' && reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > BODY_LIMIT) throw new Error('Response exceeds limit');
        chunks.push(chunk.value);
      }
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new Response(
      request.method === 'HEAD' ||
        upstream.status === 204 ||
        upstream.status === 304
        ? null
        : body,
      { status: upstream.status, headers: outputHeaders }
    );
  };
  try {
    return await Promise.race([
      perform(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Roadmap timeout'));
        }, TIMEOUT_MS);
      }),
    ]);
  } catch {
    return failure(502);
  } finally {
    clearTimeout(timer);
    controller.abort();
    void reader?.cancel().catch(() => {});
  }
}
