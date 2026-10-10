import { afterEach, expect, it, vi } from 'vite-plus/test';
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
  vi.useRealTimers();
  vi.restoreAllMocks();
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
    contentType: string | null;
    userAgent: string | null;
    body: BodyInit | null | undefined;
    redirect: RequestRedirect | undefined;
  }[] = [];
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        path: url.pathname,
        method: init?.method,
        authorization: new Headers(init?.headers).get('authorization'),
        contentType: new Headers(init?.headers).get('content-type'),
        userAgent: new Headers(init?.headers).get('user-agent'),
        body: init?.body,
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
    contentType: 'application/json',
    userAgent: 'Tuturuuu-Cron-Control/1.0',
    body: '{}',
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

it.each(['requeue', 'lookup'] as const)(
  'aborts a stalled %s phase without starting subsequent requests',
  async (phase) => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException('Deadline', 'TimeoutError')),
        milliseconds
      );
      return controller.signal;
    });
    const paths: string[] = [];
    globalThis.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        paths.push(path);
        if (phase === 'lookup' && path.endsWith('requeue_mail_push_batches'))
          return Response.json(null);
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) throw new Error('Missing deadline');
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        });
      }
    ) as typeof fetch;
    const pending = processImmediateNotifications(env);
    const rejected = expect(pending).rejects.toThrow('Deadline');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(paths).toHaveLength(phase === 'requeue' ? 1 : 2);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(paths).toHaveLength(phase === 'requeue' ? 1 : 2);
    expect(paths).not.toContain('/api/notifications/send-immediate');
  }
);

it.each(['requeue', 'lookup'] as const)(
  'rejects a %s redirect without starting subsequent requests',
  async (phase) => {
    const calls: { path: string; redirect: RequestRedirect | undefined }[] = [];
    globalThis.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        calls.push({ path, redirect: init?.redirect });
        if (phase === 'lookup' && path.endsWith('requeue_mail_push_batches'))
          return Response.json(null);
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://other.example.test/' },
        });
      }
    ) as typeof fetch;
    await expect(processImmediateNotifications(env)).rejects.toThrow(
      'failed: 302'
    );
    expect(calls).toHaveLength(phase === 'requeue' ? 1 : 2);
    expect(calls.every((call) => call.redirect === 'manual')).toBe(true);
    expect(
      calls.some((call) => call.path === '/api/notifications/send-immediate')
    ).toBe(false);
  }
);

it('keeps lookup-body consumption attached to its request deadline', async () => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException('Body deadline', 'TimeoutError')),
      milliseconds
    );
    return controller.signal;
  });
  const paths: string[] = [];
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path.endsWith('requeue_mail_push_batches'))
        return Response.json(null);
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('['));
            init?.signal?.addEventListener(
              'abort',
              () => controller.error(init.signal?.reason),
              { once: true }
            );
          },
        })
      );
    }
  ) as typeof fetch;
  const rejected = expect(processImmediateNotifications(env)).rejects.toThrow(
    'Body deadline'
  );
  await vi.advanceTimersByTimeAsync(30_000);
  await rejected;
  expect(paths).toHaveLength(2);
});
