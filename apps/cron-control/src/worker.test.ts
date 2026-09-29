import { afterEach, expect, it, vi } from 'vitest';
import { processImmediateNotifications } from './worker';

const env = {
  CRON_CONTROL_DELIVERY_TOKEN: 'test-delivery-token',
  SUPABASE_SECRET_KEY: 'test-secret',
  SUPABASE_URL: 'https://db.example.test',
  WEB_ORIGIN: 'https://web.example.test',
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

it('skips the Vercel processor when no immediate batches remain', async () => {
  const paths: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    return Response.json(
      url.pathname.endsWith('/notification_batches') ? [] : null
    );
  }) as typeof fetch;

  expect(await processImmediateNotifications(env)).toEqual({ invoked: false });
  expect(paths).toEqual([
    '/rest/v1/rpc/requeue_mail_push_batches',
    '/rest/v1/notification_batches',
  ]);
});

it('invokes the existing processor only when a pending batch exists', async () => {
  const calls: {
    path: string;
    method: string | undefined;
    authorization: string | null;
    redirect: RequestRedirect | undefined;
  }[] = [];
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        path: url.pathname,
        method: init?.method,
        authorization: new Headers(init?.headers).get('authorization'),
        redirect: init?.redirect,
      });
      return Response.json(
        url.pathname.endsWith('/notification_batches')
          ? [{ id: 'batch' }]
          : null
      );
    }
  ) as typeof fetch;

  expect(await processImmediateNotifications(env)).toEqual({ invoked: true });
  expect(calls.map((call) => call.path)).toEqual([
    '/rest/v1/rpc/requeue_mail_push_batches',
    '/rest/v1/notification_batches',
    '/api/notifications/send-immediate',
  ]);
  expect(calls[2]).toEqual({
    path: '/api/notifications/send-immediate',
    method: 'POST',
    authorization: 'Bearer test-delivery-token',
    redirect: 'manual',
  });
});

it('rejects a delivery redirect without forwarding the delivery token', async () => {
  const paths: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (path.endsWith('/notification_batches'))
      return Response.json([{ id: 'batch' }]);
    if (path === '/api/notifications/send-immediate')
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://other.example.test/' },
      });
    return Response.json(null);
  }) as typeof fetch;

  await expect(processImmediateNotifications(env)).rejects.toThrow(
    'Immediate batch delivery failed: 302'
  );
  expect(paths).toHaveLength(3);
});

it('does not invoke delivery if stale-batch recovery fails', async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
  globalThis.fetch = fetchMock as typeof fetch;
  await expect(processImmediateNotifications(env)).rejects.toThrow(
    'Push batch recovery failed: 503'
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
