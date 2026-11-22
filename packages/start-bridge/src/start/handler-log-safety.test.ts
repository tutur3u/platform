import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, expect, it, vi } from 'vitest';
import { createBridgeHandler } from './handler';

afterEach(() => vi.restoreAllMocks());

it('logs only safe fields when an app endpoint throws a PostgREST error', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const handle = createBridgeHandler({
    mounts: { app: 'mail', rootHosts: ['mail.tuturuuu.com'] },
    start: { fetch: async () => new Response('start') },
    proxy: async () => NextResponse.next(),
    assets: () => undefined,
    endpoints: [
      {
        pattern: '/api/v1/mail/domains/[domainId]/catch-all',
        module: {
          GET: async () => {
            throw {
              name: 'PostgrestError',
              code: '22P02',
              status: 400,
              message: 'invalid UUID: private@example.test',
              details: 'private endpoint detail',
            };
          },
        },
      },
    ],
    centralApiOrigin: () => 'https://central.example',
  });
  const response = await handle(
    new Request(
      'https://mail.tuturuuu.com/api/v1/mail/domains/private@example.test/catch-all'
    ),
    {},
    { waitUntil: () => {} }
  );
  expect(response.status).toBe(500);
  expect(await response.text()).toBe('Internal Server Error');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(log.mock.calls).toEqual([
    [
      '[start-bridge] request failed',
      { name: 'PostgrestError', code: '22P02', status: 400 },
    ],
  ]);
});
