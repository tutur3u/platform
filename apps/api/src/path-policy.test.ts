import { expect, test } from 'bun:test';
import { matchPath } from './registry';
import { createApi } from './pipeline';

const invalid = [
  '%6fptions',
  '%41',
  '%2F',
  '%2f',
  '%5C',
  '%00',
  '%',
  '%GG',
  'a\\b',
  'a//b',
];
const pattern = '/api/v1/workspaces/{wsId}/roles/{roleId}';
const prefix = '/api/v1/workspaces/A/roles/';
const execution = { waitUntil: (_promise: Promise<unknown>) => {} };

for (const token of invalid) {
  test(`matcher rejects unsafe raw path ${token} before matching`, () => {
    expect(() => matchPath(pattern, prefix + token)).toThrow('request path');
    expect(() => matchPath('/api/unrelated', prefix + token)).toThrow(
      'request path'
    );
  });
  test(`pipeline rejects unsafe path ${token} before enablement`, async () => {
    const request = new Request('https://api.example.test/');
    // Request URL parsing rewrites literal backslashes; expose the binding input explicitly.
    Object.defineProperty(request, 'url', {
      value: `https://api.example.test${prefix}${token}`,
    });
    let forwarded = 0;
    const run = createApi({
      endpoints: [],
      retained: [{ path: pattern }],
      fetcher: async () => {
        forwarded++;
        return new Response('unexpected');
      },
    });
    const response = await run(
      request,
      { API_WORKER_OPERATIONS: 'unknown' },
      execution
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'bad_request' },
    });
    expect(forwarded).toBe(0);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
}

for (const suffix of ['/', '//']) {
  test(`trailing slash ${suffix} cannot capture a parameter`, async () => {
    if (suffix === '/')
      expect(matchPath(pattern, `${prefix}options${suffix}`)).toBeNull();
    else
      expect(() => matchPath(pattern, `${prefix}options${suffix}`)).toThrow(
        'request path'
      );
    const run = createApi({ endpoints: [], retained: [{ path: pattern }] });
    const response = await run(
      new Request(`https://api.example.test${prefix}options${suffix}`),
      {},
      execution
    );
    expect(response.status).toBe(suffix === '/' ? 404 : 400);
  });
}
