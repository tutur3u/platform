import { NextRequest, NextResponse } from 'next/server';
import { afterEach, expect, it, vi } from 'vitest';
import { guardRejection } from '../guard-rejection';

afterEach(() => vi.restoreAllMocks());

it.each([
  [
    '/api/v1/mobile-calendar/api/v1/workspaces/private-workspace/calendar/events/private-event',
    '/api/v1/mobile-calendar/:path*',
  ],
  [
    '/api/v1/workspaces/private-workspace/wallets/private-wallet',
    '/api/:version?/workspaces/:path*',
  ],
  ['/api/private-user', '/api/:path*'],
  ['/private-user', '/:path*'],
])('logs a fixed template and generated request ID for %s', (path, route) => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const request = new NextRequest(
    `https://example.test${path}?token=private-token`,
    {
      headers: {
        'x-request-id': 'private-user-email@example.test',
        'x-vercel-id': 'private-client-id',
        authorization: 'Bearer private-token',
        cookie: 'session=private-cookie',
      },
    }
  );
  const response = NextResponse.json(
    { error: 'unchanged' },
    {
      status: 503,
      headers: {
        'Access-Control-Expose-Headers': 'Retry-After',
        'Retry-After': '30',
      },
    }
  );
  expect(guardRejection(request, response, 'offline-download-inactive')).toBe(
    response
  );
  const requestId = response.headers.get('X-Tuturuuu-Guard-Request-Id');
  expect(requestId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u);
  expect(warn).toHaveBeenCalledExactlyOnceWith('Guard rejected request', {
    reason: 'offline-download-inactive',
    route,
    requestId,
  });
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private-');
  expect(response.headers.get('Access-Control-Expose-Headers')).toBe(
    'Retry-After, X-Tuturuuu-Guard-Reason, X-Tuturuuu-Guard-Request-Id'
  );
  expect(response.headers.get('Retry-After')).toBe('30');
});

it('does not annotate or log allowed requests', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const request = { url: 'https://example.test/api/private' };
  const response = NextResponse.next();
  expect(guardRejection(request, null, 'proxy-content-rejected')).toBeNull();
  expect(guardRejection(request, response, 'proxy-content-rejected')).toBe(
    response
  );
  expect(response.headers.has('X-Tuturuuu-Guard-Reason')).toBe(false);
  expect(warn).not.toHaveBeenCalled();
});
