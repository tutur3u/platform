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
import { verifyRealtimePayload } from '../core/token';
import { publishChannelBroadcast } from './server';

const nativeFetch = globalThis.fetch;
const secret = 'synthetic-local-signing-secret';
const message = {
  type: 'broadcast',
  event: 'lists_changed',
  payload: {},
} as const;
let status = 200;
let origin = '';
let forbidden = 0;
let verified = false;
const calls: { redirect: RequestRedirect; method: string }[] = [];
const server = createServer((request, response) => {
  if (request.url !== '/channels/publish') {
    forbidden++;
    response.writeHead(500).end();
    return;
  }
  const token = request.headers.authorization?.replace(/^Bearer /, '');
  const claims = token ? verifyRealtimePayload(token, secret) : null;
  verified =
    typeof claims === 'object' &&
    claims !== null &&
    'topic' in claims &&
    claims.topic === 'board:fixture';
  response.writeHead(status, { Location: `${origin}/forbidden` });
  response.end();
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
  verified = false;
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe(
        'https://channels.example.test/channels/publish'
      );
      calls.push({ redirect: request.redirect, method: request.method });
      expect(calls.length).toBeLessThanOrEqual(1);
      return nativeFetch(`${origin}/channels/publish`, init);
    }
  );
});
afterEach(() => vi.unstubAllGlobals());
function publish() {
  return publishChannelBroadcast('board:fixture', message, {
    endpoint: 'https://channels.example.test',
    secret,
  });
}
it.each([200, 204])(
  'publishes once through Node native fetch on direct status %s',
  async (value) => {
    status = value;
    await expect(publish()).resolves.toBeUndefined();
    expect(calls).toEqual([{ redirect: 'manual', method: 'POST' }]);
    expect(verified).toBe(true);
    expect(forbidden).toBe(0);
  }
);
it.each([300, 301, 302, 303, 304, 307, 308, 399, 403, 429, 503])(
  'rejects Node status %s without following or replaying the broadcast',
  async (value) => {
    status = value;
    await expect(publish()).rejects.toThrow(
      `Cloudflare broadcast failed (${value})`
    );
    expect(calls).toEqual([{ redirect: 'manual', method: 'POST' }]);
    expect(verified).toBe(true);
    expect(forbidden).toBe(0);
  }
);
it('rejects a successful-looking opaque response', async () => {
  const response = new Response(null, { status: 200 });
  Object.defineProperty(response, 'type', { value: 'opaqueredirect' });
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetch);
  await expect(publish()).rejects.toThrow('Cloudflare broadcast failed (200)');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('propagates network failure without replay', async () => {
  const failure = new Error('Synthetic network failure');
  const fetch = vi.fn().mockRejectedValue(failure);
  vi.stubGlobal('fetch', fetch);
  await expect(publish()).rejects.toBe(failure);
  expect(fetch).toHaveBeenCalledTimes(1);
});
