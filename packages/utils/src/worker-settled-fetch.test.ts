// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isMalformedRequest,
  type WorkerContextLike,
  withSettledResponse,
} from './worker-settled-fetch';

const TIMEOUT = 150;
/** Every case must settle well inside this bound. */
const FAST = 1_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

interface BridgeStream {
  /** Flushes headers: the only call that resolves the Worker Response. */
  writeHeaders(status: number): {
    write(chunk: string): void;
    end(): void;
    error(reason: unknown): void;
  };
}

/**
 * The OpenNext `cloudflare-node` wrapper's shape: the Response resolves only
 * from `writeHeaders`, and the server handler runs inside `ctx.waitUntil`.
 * `before` models the Worker's work ahead of the handler (middleware
 * registering resolved waitUntil work, a cold `import()` of the handler).
 */
function bridge(
  handler: (stream: BridgeStream) => Promise<void>,
  before?: (ctx: WorkerContextLike) => Promise<void>
) {
  return vi.fn(
    async (_request: Request, _env: unknown, ctx: WorkerContextLike) => {
      await before?.(ctx);
      let resolve!: (response: Response) => void;
      const promise = new Promise<Response>((done) => {
        resolve = done;
      });
      const encoder = new TextEncoder();
      ctx.waitUntil(
        handler({
          writeHeaders(status) {
            let controller!: ReadableStreamDefaultController<Uint8Array>;
            const body = new ReadableStream<Uint8Array>({
              start(c) {
                controller = c;
              },
            });
            resolve(new Response(body, { status }));
            return {
              write: (chunk) => controller.enqueue(encoder.encode(chunk)),
              end: () => controller.close(),
              error: (reason) => controller.error(reason),
            };
          },
        })
      );
      return promise;
    }
  );
}

function context(): WorkerContextLike {
  return {
    waitUntil(promise) {
      promise.catch(() => undefined);
    },
  };
}

async function settle(
  fetch: (
    request: Request,
    env: unknown,
    ctx: WorkerContextLike
  ) => Promise<Response>,
  request: Request,
  options: {
    isUnroutable?: (url: URL) => boolean;
    timeout?: number | null;
  } = {}
) {
  const guarded = withSettledResponse(fetch, {
    app: 'test',
    isUnroutable: options.isUnroutable,
    headersTimeoutMs: () =>
      options.timeout === undefined ? TIMEOUT : options.timeout,
  });
  const started = performance.now();
  const response = await guarded(request, {}, context());
  const body = await response.text().then(
    (text) => ({ text }),
    (error: unknown) => ({ error })
  );
  return { response, body, elapsed: performance.now() - started };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isMalformedRequest', () => {
  it.each([
    ['GET', 'https://app.test/index.php/%0Atest'],
    ['GET', 'https://app.test/a%00b'],
    ['GET', 'https://app.test/%E0%A4%A'],
    ['PROPFIND', 'https://app.test/'],
    ['TRACE', 'https://app.test/en'],
  ])('rejects %s %s', (method, url) => {
    expect(isMalformedRequest(new URL(url), method)).toBe(true);
  });

  it.each([
    ['GET', 'https://app.test/en/worlds'],
    ['POST', 'https://app.test/api/v1/lettin/bookmarks'],
    ['GET', 'https://app.test/en/creators/Ng%E1%BB%8Dc'],
    ['OPTIONS', 'https://app.test/api/v1/lettin/health'],
  ])('admits %s %s', (method, url) => {
    expect(isMalformedRequest(new URL(url), method)).toBe(false);
  });
});

describe('withSettledResponse', () => {
  it('answers a malformed path with 404 before the bridge', async () => {
    const fetch = bridge(async () => undefined);
    const { response, elapsed } = await settle(
      fetch,
      new Request('https://app.test/index.php/%0Atest')
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
    expect(elapsed).toBeLessThan(FAST);
  });

  it('answers an app-unroutable path with 404 before the bridge', async () => {
    const fetch = bridge(async () => undefined);
    const { response } = await settle(
      fetch,
      new Request('https://app.test/getcfg.php', { method: 'POST', body: 'x' }),
      { isUnroutable: (url) => url.pathname.endsWith('.php') }
    );
    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers HEAD rejections without a body', async () => {
    const { response, body } = await settle(
      bridge(async () => undefined),
      new Request('https://app.test/a%00', { method: 'HEAD' })
    );
    expect(response.status).toBe(404);
    expect(body).toEqual({ text: '' });
  });

  it('passes a served response through unchanged', async () => {
    const { response, body } = await settle(
      bridge(async (stream) => {
        const res = stream.writeHeaders(201);
        res.write('hello ');
        res.write('world');
        res.end();
      }),
      new Request('https://app.test/en')
    );
    expect(response.status).toBe(201);
    expect(body).toEqual({ text: 'hello world' });
  });

  it('serves a handler registered late after resolved waitUntil work', async () => {
    const { response, body } = await settle(
      bridge(
        async (stream) => {
          const res = stream.writeHeaders(200);
          res.write('cold');
          res.end();
        },
        async (ctx) => {
          // Middleware registers already-resolved work, then a cold import
          // delays the handler.
          ctx.waitUntil(Promise.resolve());
          await sleep(TIMEOUT / 2);
        }
      ),
      new Request('https://app.test/en')
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({ text: 'cold' });
  });

  it('keeps a gappy body after all waitUntil work resolved', async () => {
    const { body } = await settle(
      bridge(async (stream) => {
        const res = stream.writeHeaders(200);
        // The proxied upstream keeps streaming after the handler settled.
        void (async () => {
          for (const part of ['a', 'b', 'c']) {
            res.write(part);
            await sleep(TIMEOUT);
          }
          res.end();
        })();
      }),
      new Request('https://app.test/api/v1/stream')
    );
    expect(body).toEqual({ text: 'abc' });
  });

  it('answers 500 quickly when the fetch rejects, without logging detail', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { response, body, elapsed } = await settle(async () => {
      throw new Error('secret token abc123');
    }, new Request('https://app.test/en'));
    expect(response.status).toBe(500);
    expect(body).toEqual({ text: 'Internal Server Error' });
    expect(elapsed).toBeLessThan(FAST);
    expect(JSON.stringify(error.mock.calls)).not.toContain('abc123');
  });

  it('answers 500 when the fetch throws synchronously', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { response } = await settle(() => {
      throw new Error('sync');
    }, new Request('https://app.test/en'));
    expect(response.status).toBe(500);
  });

  it.each([
    [
      'a handler that throws before headers',
      () => Promise.reject(new Error('render failed')),
    ],
    // pipeToNodeResponse's abort path: res.destroy(err) before any header
    // flush, so writeHeaders is never called.
    ['a response destroyed before headers', () => Promise.resolve()],
    ['a handler that never ends', () => new Promise<void>(() => {})],
  ])('answers 504 at the backstop for %s', async (_name, handler) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { response, elapsed } = await settle(
      bridge(handler),
      new Request('https://app.test/en')
    );
    expect(response.status).toBe(504);
    expect(elapsed).toBeGreaterThanOrEqual(TIMEOUT - 10);
    expect(elapsed).toBeLessThan(FAST);
  });

  it('leaves routes without a backstop to run past it', async () => {
    const { response, body } = await settle(
      bridge(async (stream) => {
        await sleep(TIMEOUT * 2);
        const res = stream.writeHeaders(200);
        res.write('imported');
        res.end();
      }),
      new Request('https://app.test/api/v1/import', { method: 'POST' }),
      { timeout: null }
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({ text: 'imported' });
  });

  it('passes a stream error after headers through to the client', async () => {
    const { response, body, elapsed } = await settle(
      bridge(async (stream) => {
        const res = stream.writeHeaders(200);
        res.write('partial');
        res.error(new Error('render failed'));
      }),
      new Request('https://app.test/en')
    );
    expect(response.status).toBe(200);
    expect(body).toHaveProperty('error');
    expect(elapsed).toBeLessThan(FAST);
  });
});
