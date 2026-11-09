// @vitest-environment node
import { createServer } from 'node:http';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./storage-download-budget', () => ({
  reserveStorageDownloadBudget: async () => undefined,
}));

import { relayStorageDownload } from './storage-download-relay';
import { createStorageDownloadUrl } from './storage-download-token';

const nativeFetch = globalThis.fetch;
const upstream =
  'https://storage.example.test/storage/v1/object/sign/workspaces/ws-1/file.bin?token=synthetic';
let token = '';
let origin = '';
let headStatus = 200;
let getStatus = 200;
let forbidden = 0;
const calls: { method: string; redirect: RequestRedirect }[] = [];
const server = createServer((request, response) => {
  if (request.url !== '/object') {
    forbidden++;
    response.writeHead(500).end();
    return;
  }
  const status = request.method === 'HEAD' ? headStatus : getStatus;
  response.writeHead(status, {
    'Content-Length': '4',
    'Content-Type': 'application/octet-stream',
    Location: `${origin}/forbidden`,
  });
  response.end(request.method === 'HEAD' ? undefined : 'data');
});
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture port');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});
beforeEach(() => {
  headStatus = 200;
  getStatus = 200;
  forbidden = 0;
  calls.length = 0;
  vi.stubEnv(
    'STORAGE_DOWNLOAD_SIGNING_SECRET',
    'synthetic-local-signing-secret'
  );
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://storage.example.test');
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://storage.example.test');
  vi.stubEnv('WEB_APP_URL', 'https://web.example.test');
  vi.stubEnv('STORAGE_DOWNLOAD_REVOKED_BEFORE', '0');
  const value = createStorageDownloadUrl(upstream, 'ws-1', 60)
    .split('/')
    .at(-1);
  if (!value) throw new Error('Missing synthetic ticket');
  token = value;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe(upstream);
      calls.push({ method: request.method, redirect: request.redirect });
      expect(calls.length).toBeLessThanOrEqual(2);
      return nativeFetch(`${origin}/object`, init);
    }
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function relay(method = 'GET') {
  return relayStorageDownload(
    new Request('https://web.example.test/file', { method }),
    token
  );
}
it('streams a direct response through Node native fetch without exposing Location', async () => {
  const response = await relay();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('data');
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(calls).toEqual([
    { method: 'HEAD', redirect: 'manual' },
    { method: 'GET', redirect: 'manual' },
  ]);
  expect(forbidden).toBe(0);
});
it('keeps HEAD as one inspection with no body request', async () => {
  const response = await relay('HEAD');
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('');
  expect(calls).toEqual([{ method: 'HEAD', redirect: 'manual' }]);
});
it.each([301, 302, 307, 308, 403, 503])(
  'denies HEAD status %s without downloading or following',
  async (status) => {
    headStatus = status;
    const response = await relay();
    expect(response.status).toBe(502);
    expect(calls).toEqual([{ method: 'HEAD', redirect: 'manual' }]);
    expect(response.headers.get('location')).toBeNull();
    expect(forbidden).toBe(0);
  }
);
it.each([301, 302, 307, 308, 403, 503])(
  'denies GET status %s without following or retrying',
  async (status) => {
    getStatus = status;
    const response = await relay();
    expect(response.status).toBe(502);
    expect(calls).toEqual([
      { method: 'HEAD', redirect: 'manual' },
      { method: 'GET', redirect: 'manual' },
    ]);
    expect(response.headers.get('location')).toBeNull();
    expect(forbidden).toBe(0);
  }
);
it.each(['HEAD', 'GET'])('retains direct 404 for %s', async (phase) => {
  if (phase === 'HEAD') headStatus = 404;
  else getStatus = 404;
  expect((await relay()).status).toBe(404);
  expect(calls).toHaveLength(phase === 'HEAD' ? 1 : 2);
  expect(forbidden).toBe(0);
});
it.each(['HEAD', 'GET'])(
  'denies a successful-looking opaque %s response',
  async (phase) => {
    const opaque = new Response('data', { headers: { 'Content-Length': '4' } });
    Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' });
    const fetch = vi.fn().mockResolvedValue(opaque);
    if (phase === 'GET')
      fetch.mockResolvedValueOnce(
        new Response(null, { headers: { 'Content-Length': '4' } })
      );
    vi.stubGlobal('fetch', fetch);
    expect((await relay()).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(phase === 'HEAD' ? 1 : 2);
  }
);
it('sanitizes a network failure without retry', async () => {
  const fetch = vi
    .fn()
    .mockRejectedValue(new Error('Synthetic private detail'));
  vi.stubGlobal('fetch', fetch);
  const response = await relay();
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    message: 'Storage download unavailable',
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
