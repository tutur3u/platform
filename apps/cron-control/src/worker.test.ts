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
  }[] = [];
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        path: url.pathname,
        method: init?.method,
        authorization: new Headers(init?.headers).get('authorization'),
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
  });
});

it('does not invoke delivery if stale-batch recovery fails', async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
  globalThis.fetch = fetchMock as typeof fetch;
  await expect(processImmediateNotifications(env)).rejects.toThrow(
    'Push batch recovery failed: 503'
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
