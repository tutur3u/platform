import { expect, test } from 'bun:test';
import { z } from 'zod';
import type { SecurityAdapter } from './contracts';
import { ApiError } from './errors';
import { createApi } from './pipeline';
import { comparePathPatterns, defineRoute, matchPath } from './registry';

const execution = { waitUntil: (_promise: Promise<unknown>) => {} };
const root = '/api/v1/workspaces/{wsId}/';
const pairs = [
  ['api-keys/roles', 'api-keys/{keyId}'],
  ['roles/default', 'roles/{roleId}'],
  ['roles/options', 'roles/{roleId}'],
];

for (const [staticTail, dynamicTail] of pairs) {
  if (!staticTail || !dynamicTail) throw new Error('Missing collision fixture');
  const staticPath = root + staticTail;
  const dynamicPath = root + dynamicTail;
  const path = staticPath.replace('{wsId}', 'A');
  const fixture = (
    operationId: string,
    routePath: string,
    method: 'GET' | 'PUT' = 'GET'
  ) =>
    defineRoute({
      operationId,
      path: routePath,
      method,
      aliases: [],
      guard: 'web-api',
      policy: { kind: 'public' },
      limits: { bodyBytes: 0, deadlineMs: 1000, ratePolicy: 'test' },
      input: z.unknown(),
      output: z.object({ operationId: z.string() }),
      body: 'none',
      status: 200,
      handle: () => ({ operationId }),
    });
  test(`${staticTail} ranks before parameter regardless of declaration order`, () => {
    expect([dynamicPath, staticPath].sort(comparePathPatterns)).toEqual([
      staticPath,
      dynamicPath,
    ]);
    expect(comparePathPatterns(dynamicPath, staticPath)).toBeGreaterThan(0);
    expect(matchPath(staticPath, path)).toEqual({ wsId: 'A' });
    expect(matchPath(staticPath, path.toUpperCase())).toBeNull();
    expect(
      matchPath(
        dynamicPath,
        path.replace(/[^/]+$/, (token) => token.toUpperCase())
      )
    ).not.toBeNull();
  });
  for (const method of ['GET', 'HEAD', 'PUT']) {
    for (const enabled of [true, false]) {
      test(`${method} ${staticTail}: static ownership before enablement=${enabled}`, async () => {
        const guarded: string[] = [];
        const forwarded: Request[] = [];
        const security: SecurityAdapter = {
          guard: async (_request, endpoint) => {
            guarded.push(endpoint.operationId);
          },
          resolvePrincipal: async () => ({ kind: 'public' }),
          authorize: async () => ({ kind: 'identity' }),
        };
        const run = createApi({
          endpoints: [
            fixture('dynamicGet', dynamicPath),
            fixture('dynamicPut', dynamicPath, 'PUT'),
            fixture('staticGet', staticPath),
          ],
          retained: [{ path: staticPath }],
          security,
          fetcher: async (request) => {
            forwarded.push(request);
            return Response.json({ owner: 'retained' });
          },
        });
        const response = await run(
          new Request(`https://api.example.test${path}?page=1`, {
            method,
            headers: {
              'cf-connecting-ip': '192.0.2.1',
              authorization: 'Bearer synthetic',
              origin: 'https://api.example.test',
            },
          }),
          {
            API_WORKER_OPERATIONS: `dynamicGet,dynamicPut${enabled ? ',staticGet' : ''}`,
            RETAINED_API_ORIGIN: 'https://retained.example.net',
            TRUSTED_PROXY_ORIGIN_SECRET:
              'synthetic-test-secret-at-least-32-bytes',
          },
          execution
        );
        const worker = enabled && method !== 'PUT';
        expect(response.status).toBe(200);
        expect(guarded).toEqual(worker ? ['staticGet'] : []);
        expect(forwarded.length).toBe(worker ? 0 : 1);
        if (forwarded[0]) {
          expect(forwarded[0].method).toBe(method);
          expect(forwarded[0].url).toBe(
            `https://retained.example.net${path}?page=1`
          );
          expect(forwarded[0].headers.get('authorization')).toBe(
            'Bearer synthetic'
          );
          expect(forwarded[0].headers.get('origin')).toBe(
            'https://api.example.test'
          );
          expect(forwarded[0].redirect).toBe('manual');
        }
        if (method === 'HEAD') expect(await response.text()).toBe('');
        else
          expect(await response.json()).toEqual(
            worker ? { operationId: 'staticGet' } : { owner: 'retained' }
          );
      });
    }
  }
  for (const status of [401, 403, 429, 500]) {
    test(`${staticTail} terminal guard error ${status} never falls back`, async () => {
      let forwarded = 0;
      const run = createApi({
        endpoints: [
          fixture('dynamicGet', dynamicPath),
          fixture('staticGet', staticPath),
        ],
        retained: [{ path: staticPath }],
        security: {
          guard: async () => {
            throw new ApiError('forbidden', status, 'Denied');
          },
          resolvePrincipal: async () => ({ kind: 'public' }),
          authorize: async () => ({ kind: 'identity' }),
        },
        fetcher: async () => {
          forwarded++;
          return new Response();
        },
      });
      const response = await run(
        new Request(`https://api.example.test${path}`),
        { API_WORKER_OPERATIONS: 'staticGet,dynamicGet' },
        execution
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        error: {
          code: 'forbidden',
          message: status >= 500 ? 'Service unavailable' : 'Denied',
        },
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(forwarded).toBe(0);
    });
  }
}
