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

import { createHttpGuardTransport } from './abuse-guard/client';
import type { GuardRpc } from './abuse-guard/protocol';
import { coordinate } from './coordination';

const nativeFetch = globalThis.fetch;
const secret = 'synthetic-local-secret-'.repeat(3);
const rpc = {
  v: 1,
  id: 'a'.repeat(24),
  family: 'offline',
  steps: [{ p: 'a'.repeat(64), cmds: [{ op: 'kv.get', k: 'b'.repeat(64) }] }],
} satisfies GuardRpc;
const input = {
  namespace: 'authenticator',
  key: 'a'.repeat(64),
  owner: '0199619a-9154-7000-8000-000000000001',
  action: 'acquire',
} as const;
const approval = { outcome: 'acquired', fresh: true, completed: false };
const reply = { v: 1, steps: [{ results: [{ op: 'kv.get', v: null }] }] };
let status = 200;
let origin = '';
let forbidden = 0;
const calls: { path: string; redirect: RequestRedirect; method: string }[] = [];
const server = createServer((request, response) => {
  if (request.url === '/forbidden') forbidden++;
  response.writeHead(status, {
    'Content-Type': 'application/json',
    Location: `${origin}/forbidden`,
  });
  response.end(
    JSON.stringify(
      status === 200
        ? request.url === '/v1/coordinate'
          ? approval
          : reply
        : { error: 'guard_stopped' }
    )
  );
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
  status = 200;
  forbidden = 0;
  calls.length = 0;
  vi.stubEnv(
    'CLOUDFLARE_COORDINATION_URL',
    'https://coordination.example.test'
  );
  vi.stubEnv('CLOUDFLARE_COORDINATION_TOKEN', secret);
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      expect([
        'https://coordination.example.test/v1/coordinate',
        'https://guard.example.test/v1/rpc',
      ]).toContain(request.url);
      calls.push({
        path: url.pathname,
        redirect: request.redirect,
        method: request.method,
      });
      expect(calls.length).toBeLessThanOrEqual(1);
      return nativeFetch(`${origin}${url.pathname}`, init);
    }
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function guard() {
  return createHttpGuardTransport({
    url: 'https://guard.example.test',
    secret,
    timeoutMs: 1000,
  })(rpc);
}
it('keeps direct coordination success on Node native fetch', async () => {
  await expect(coordinate(input)).resolves.toEqual(approval);
  expect(calls).toEqual([
    { path: '/v1/coordinate', redirect: 'manual', method: 'POST' },
  ]);
  expect(forbidden).toBe(0);
});
it('keeps direct signed guard success on Node native fetch', async () => {
  await expect(guard()).resolves.toEqual(reply);
  expect(calls).toEqual([
    { path: '/v1/rpc', redirect: 'manual', method: 'POST' },
  ]);
  expect(forbidden).toBe(0);
});
it.each([300, 301, 302, 303, 304, 307, 308, 399])(
  'coordination denies Node redirect %s without replay',
  async (value) => {
    status = value;
    await expect(coordinate(input)).rejects.toThrow(
      'Shared coordination is temporarily unavailable'
    );
    expect(calls).toEqual([
      { path: '/v1/coordinate', redirect: 'manual', method: 'POST' },
    ]);
    expect(forbidden).toBe(0);
  }
);
it.each([300, 301, 302, 303, 304, 307, 308, 399])(
  'guard denies Node redirect %s without replay or adopting its error payload',
  async (value) => {
    status = value;
    await expect(guard()).rejects.toMatchObject({ code: 'network' });
    expect(calls).toEqual([
      { path: '/v1/rpc', redirect: 'manual', method: 'POST' },
    ]);
    expect(forbidden).toBe(0);
  }
);
it('retains the guard error code from a direct unsuccessful response', async () => {
  status = 403;
  await expect(guard()).rejects.toMatchObject({ code: 'guard_stopped' });
  expect(calls).toHaveLength(1);
  expect(forbidden).toBe(0);
});
it.each(['coordination', 'guard'])(
  'denies a successful-looking opaque %s response before parsing',
  async (kind) => {
    const response = Response.json(kind === 'guard' ? reply : approval);
    Object.defineProperty(response, 'type', { value: 'opaqueredirect' });
    const json = vi.spyOn(response, 'json');
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetch);
    if (kind === 'guard')
      await expect(guard()).rejects.toMatchObject({ code: 'network' });
    else
      await expect(coordinate(input)).rejects.toThrow(
        'Shared coordination is temporarily unavailable'
      );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
  }
);
