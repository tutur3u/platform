import { describe, expect, it, vi } from 'vitest';
import { PAGE_REWRITE_HEADER } from '../lib/page-rewrite';
import {
  createTasksRequestHandler,
  denyFraming,
  type TasksBridgeHandler,
  type TasksWorkerEnv,
  tasksMounts,
} from './worker-request';

const ctx = { waitUntil: vi.fn() };

function setup(response?: () => Response) {
  const bridge = vi.fn<TasksBridgeHandler>(
    async (request) =>
      response?.() ?? new Response(`bridge ${new URL(request.url).pathname}`)
  );
  const createBridge = vi.fn(() => bridge);
  return {
    bridge,
    createBridge,
    handle: createTasksRequestHandler(createBridge),
  };
}

function expectParityHeaders(response: Response) {
  expect(response.headers.get('x-tuturuuu-runtime')).toBe('native');
  expect(response.headers.get('x-robots-tag')).toBe(
    'noindex, nofollow, nosnippet'
  );
  expect(response.headers.get('content-security-policy')).toBe(
    "frame-ancestors 'none'"
  );
  expect(response.headers.get('x-frame-options')).toBe('DENY');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe(
    'strict-origin-when-cross-origin'
  );
  expect(response.headers.get('strict-transport-security')).toBe(
    'max-age=63072000'
  );
}

describe('Tasks Worker request step (subdomain root + tuturuuu.com/tasks, fail-closed)', () => {
  it.each([
    'https://tuturuuu.com/api/build-info',
    'https://tuturuuu.com/personal/tasks',
    'https://tuturuuu.com/tasks-team/x',
    'https://tuturuuu.com/',
    'https://evil.example/personal/tasks',
    'https://tuturuuu-tasks-vite-staging.someone.workers.dev/',
  ])('answers an unlisted host with a decorated 404: %s', async (url) => {
    const { createBridge, handle } = setup();

    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const response = await handle(new Request(url, { method }), {}, ctx);
      expect(response.status).toBe(404);
      expectParityHeaders(response);
    }
    expect(createBridge).not.toHaveBeenCalled();
  });

  it('serves build-info under the tuturuuu.com/tasks mount', async () => {
    const { createBridge, handle } = setup();
    for (const url of [
      'https://tuturuuu.com/tasks/api/build-info',
      'https://tuturuuu.com/tasks/api/build-info?x=1',
    ]) {
      const response = await handle(new Request(url), {}, ctx);
      expect(response.status).toBe(200);
      expect(((await response.json()) as { appName: string }).appName).toBe(
        'tasks'
      );
      expectParityHeaders(response);
    }
    expect(createBridge).not.toHaveBeenCalled();
  });

  it('hands mounted pages to the bridge with the mount config', async () => {
    const { bridge, createBridge, handle } = setup();
    for (const url of [
      'https://tuturuuu.com/tasks',
      'https://tuturuuu.com/tasks?view=board',
      'https://tuturuuu.com/tasks/personal/tasks',
    ]) {
      const response = await handle(new Request(url), {}, ctx);
      expect(response.status).toBe(200);
    }
    expect(createBridge).toHaveBeenCalledTimes(1);
    expect(createBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        mountHosts: ['tuturuuu.com'],
        basePath: '/tasks',
      })
    );
    expect(bridge).toHaveBeenCalledTimes(3);
  });

  it('serves build-info at the subdomain root', async () => {
    const { createBridge, handle } = setup();
    const url = 'https://tasks.tuturuuu.com/api/build-info';

    const get = await handle(new Request(url), {}, ctx);
    const head = await handle(new Request(url, { method: 'HEAD' }), {}, ctx);
    const options = await handle(
      new Request(url, { method: 'OPTIONS' }),
      {},
      ctx
    );

    expect(get.status).toBe(200);
    expect(((await get.json()) as { appName: string }).appName).toBe('tasks');
    expectParityHeaders(get);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(options.status).toBe(204);
    expect(createBridge).not.toHaveBeenCalled();
  });

  it('hands root paths to the bridge with the admitted mounts and no client page rewrite', async () => {
    const { bridge, createBridge, handle } = setup();

    const response = await handle(
      new Request('https://tasks.tuturuuu.com/personal/tasks', {
        headers: { [PAGE_REWRITE_HEADER]: '/en/task-link-preview' },
      }),
      {},
      ctx
    );

    expect(await response.text()).toBe('bridge /personal/tasks');
    expect(createBridge).toHaveBeenCalledWith(tasksMounts({}));
    expect(bridge.mock.calls[0]?.[0].headers.has(PAGE_REWRITE_HEADER)).toBe(
      false
    );
    expectParityHeaders(response);
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    );
  });

  it('keeps asset caching and stores no dynamic response', async () => {
    const { handle } = setup(
      () =>
        new Response('x', {
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
        })
    );

    const asset = await handle(
      new Request('https://tasks.tuturuuu.com/assets/index-abc.js'),
      {},
      ctx
    );
    const page = await handle(
      new Request('https://tasks.tuturuuu.com/personal/tasks'),
      {},
      ctx
    );

    expect(asset.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(page.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    );
  });

  it.each([
    'private, max-age=60, stale-while-revalidate=30',
    'private, max-age=10, stale-while-revalidate=20',
    'no-store',
  ])('replaces a handler cache policy with no-store: %s', async (policy) => {
    const { handle } = setup(
      () => new Response('{}', { headers: { 'cache-control': policy } })
    );

    const response = await handle(
      new Request('https://tasks.tuturuuu.com/api/v1/users/me/task-settings'),
      {},
      ctx
    );

    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    );
  });

  it.each([
    ['POST', '/assets/index-abc.js'],
    ['PUT', '/assets/index-abc.js'],
    ['POST', '/favicon.ico'],
    ['DELETE', '/robots.txt'],
  ])('stores no %s response on an asset path: %s', async (method, path) => {
    const { handle } = setup(
      () =>
        new Response('x', {
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
        })
    );

    const response = await handle(
      new Request(`https://tasks.tuturuuu.com${path}`, { method }),
      {},
      ctx
    );

    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    );
  });

  it('keeps asset caching for HEAD', async () => {
    const { handle } = setup(
      () =>
        new Response(null, {
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
        })
    );

    const response = await handle(
      new Request('https://tasks.tuturuuu.com/favicon.ico', { method: 'HEAD' }),
      {},
      ctx
    );

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
  });

  it.each([
    ["default-src 'self'", "default-src 'self'; frame-ancestors 'none'"],
    [
      "default-src 'self'; frame-ancestors https://evil.example; img-src *",
      "default-src 'self'; img-src *; frame-ancestors 'none'",
    ],
    ['FRAME-ANCESTORS *', "frame-ancestors 'none'"],
    [
      "script-src 'nonce-a', frame-ancestors *; style-src 'self'",
      "script-src 'nonce-a'; frame-ancestors 'none', style-src 'self'; frame-ancestors 'none'",
    ],
  ])(
    'keeps an existing CSP but enforces frame-ancestors none: %s',
    async (csp, expected) => {
      const { handle } = setup(
        () => new Response('x', { headers: { 'content-security-policy': csp } })
      );

      const response = await handle(
        new Request('https://tasks.tuturuuu.com/personal/tasks'),
        {},
        ctx
      );

      expect(response.headers.get('content-security-policy')).toBe(expected);
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    }
  );

  it.each([
    '/api/v1/workspaces/ws/external-projects/assets/a/webgl',
    '/api/v1/workspaces/ws/external-projects/assets/a/webgl/index.html',
  ])('leaves the framable WebGL path frameable: %s', async (path) => {
    const { handle } = setup(
      () =>
        new Response('x', {
          headers: { 'content-security-policy': "default-src 'self'" },
        })
    );

    const response = await handle(
      new Request(`https://tasks.tuturuuu.com${path}`),
      {},
      ctx
    );

    expect(response.headers.has('x-frame-options')).toBe(false);
    expect(response.headers.get('content-security-policy')).toBe(
      "default-src 'self'"
    );
    expect(response.headers.get('x-robots-tag')).toBe(
      'noindex, nofollow, nosnippet'
    );
    expect(response.headers.get('cache-control')).toBe(
      'private, no-store, max-age=0'
    );
  });

  it.each([
    '/api/v1/workspaces/ws/external-projects/assets/a/webglx',
    '/api/v1/workspaces/ws/external-projects/assets/a/b/webgl',
    '/x/api/v1/workspaces/ws/external-projects/assets/a/webgl',
  ])('denies framing next to the WebGL path: %s', async (path) => {
    const { handle } = setup();

    const response = await handle(
      new Request(`https://tasks.tuturuuu.com${path}`),
      {},
      ctx
    );

    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toBe(
      "frame-ancestors 'none'"
    );
  });

  it('denies framing when there is no CSP', () => {
    expect(denyFraming(null)).toBe("frame-ancestors 'none'");
    expect(denyFraming(' ; , ')).toBe("frame-ancestors 'none'");
  });

  it('admits only valid staging hostnames from the Worker var', async () => {
    const { createBridge, handle } = setup();
    const env = {
      TUTURUUU_STAGING_HOSTS:
        'tuturuuu-tasks-vite-staging.ops.workers.dev, evil.example, tasks-staging.tuturuuu.com, tasks.tutur3u.com',
    };

    const staging = await handle(
      new Request('https://tuturuuu-tasks-vite-staging.ops.workers.dev/'),
      env,
      ctx
    );
    const evil = await handle(new Request('https://evil.example/'), env, ctx);

    expect(staging.status).toBe(200);
    expect(evil.status).toBe(404);
    expect(tasksMounts(env)).toEqual({
      app: 'tasks',
      rootHosts: [
        'tasks.tuturuuu.com',
        'tuturuuu-tasks-vite-staging.ops.workers.dev',
        'tasks.tutur3u.com',
      ],
      mountHosts: ['tuturuuu.com'],
      basePath: '/tasks',
      unknownHost: 'reject',
    });
    expect(createBridge).toHaveBeenCalledTimes(1);
  });

  it('never trusts request headers to admit a host', async () => {
    const { createBridge, handle } = setup();

    const response = await handle(
      new Request('https://evil.example/', {
        headers: {
          'x-forwarded-host': 'tasks.tuturuuu.com',
          'x-tuturuuu-app-base': '/tasks',
        },
      }),
      {},
      ctx
    );

    expect(response.status).toBe(404);
    expect(createBridge).not.toHaveBeenCalled();
  });
});

describe('Tasks document security headers (D87 per-app gate)', () => {
  const POLICY =
    "script-src 'nonce-n0nce' 'strict-dynamic'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
  const html =
    (status = 200, csp: string | null = POLICY) =>
    () =>
      new Response('<!doctype html><script nonce="n0nce"></script>', {
        status,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          ...(csp ? { 'content-security-policy': csp } : {}),
        },
      });
  const call = async (
    url: string,
    env: Record<string, string> = {},
    respond = html()
  ) => {
    const { handle } = setup(respond);
    return handle(new Request(url), env as TasksWorkerEnv, ctx);
  };
  const enforced = (response: Response) =>
    response.headers.get('content-security-policy') ?? '';
  const reported = (response: Response) =>
    response.headers.get('content-security-policy-report-only') ?? '';

  it('reports the exact target policy (nonce + Trusted Types) on root, mount and 404 HTML', async () => {
    for (const [url, status, base] of [
      ['https://tasks.tuturuuu.com/personal', 200, ''],
      ['https://tuturuuu.com/tasks/personal', 200, '/tasks'],
      ['https://tuturuuu.com/tasks/missing', 404, '/tasks'],
    ] as const) {
      const response = await call(url, {}, html(status));
      expect(response.status).toBe(status);
      expect(reported(response)).toBe(
        `${POLICY}; require-trusted-types-for 'script'; trusted-types dompurify; report-uri ${base}/api/csp-report; report-to csp`
      );
      expect(response.headers.get('reporting-endpoints')).toBe(
        `csp="${base}/api/csp-report"`
      );
      // Report-only stage: only framing is enforced.
      expect(enforced(response)).toBe("frame-ancestors 'none'");
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    }
  });

  it('enforces the script policy with TTR_CSP_TASKS=enforce, still reporting Trusted Types', async () => {
    const response = await call('https://tasks.tuturuuu.com/personal', {
      TTR_CSP_TASKS: ' Enforce ',
    });
    const policy = enforced(response);
    for (const directive of [
      "script-src 'nonce-n0nce' 'strict-dynamic'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'report-uri /api/csp-report',
    ])
      expect(policy).toContain(directive);
    expect(policy).not.toContain('require-trusted-types-for');
    expect(reported(response)).toContain('trusted-types dompurify');
  });

  it('enforces Trusted Types only together with the script policy', async () => {
    const both = await call('https://tasks.tuturuuu.com/personal', {
      TTR_CSP_TASKS: 'enforce',
      TTR_TRUSTED_TYPES_TASKS: 'ENFORCE',
    });
    expect(enforced(both)).toContain(
      "require-trusted-types-for 'script'; trusted-types dompurify"
    );
    expect(enforced(both)).not.toContain('allow-duplicates');
    expect(both.headers.has('content-security-policy-report-only')).toBe(false);

    const ttOnly = await call('https://tasks.tuturuuu.com/personal', {
      TTR_TRUSTED_TYPES_TASKS: 'enforce',
    });
    expect(enforced(ttOnly)).toBe("frame-ancestors 'none'");
    expect(reported(ttOnly)).toContain('trusted-types dompurify');
  });

  it('treats typos as report-only', async () => {
    for (const value of ['enforced', 'on', 'true', '1', '']) {
      const response = await call('https://tasks.tuturuuu.com/personal', {
        TTR_CSP_TASKS: value,
        TTR_TRUSTED_TYPES_TASKS: value,
      });
      expect(enforced(response), value).toBe("frame-ancestors 'none'");
      expect(reported(response), value).toContain('trusted-types dompurify');
    }
  });

  it('keeps the policy of HTML forwarded through /api, and of framable paths', async () => {
    const own = "sandbox; default-src 'none'";
    for (const url of [
      'https://tuturuuu.com/tasks/api/cli/auth/copy-token',
      'https://tasks.tuturuuu.com/api/v1/unsubscribe',
      'https://tasks.tuturuuu.com/api/v1/workspaces/ws/external-projects/assets/a/webgl/index.html',
    ]) {
      const response = await call(url, {}, html(200, own));
      expect(
        response.headers.has('content-security-policy-report-only'),
        url
      ).toBe(false);
      expect(enforced(response), url).toContain(own);
    }
  });

  it('adds no document policy to non-HTML responses', async () => {
    const response = await call(
      'https://tasks.tuturuuu.com/personal',
      { TTR_CSP_TASKS: 'enforce' },
      () => Response.json({ ok: true })
    );
    expect(response.headers.has('content-security-policy-report-only')).toBe(
      false
    );
  });

  it('serves the static offline page under a same-origin script policy', async () => {
    const { OFFLINE_PAGE_POLICY, tasksPagePolicy } =
      await import('./worker-handler');
    expect(OFFLINE_PAGE_POLICY).toContain("script-src 'self'");
    expect(OFFLINE_PAGE_POLICY).toContain("form-action 'self'");
    for (const directive of POLICY.split('; '))
      expect(tasksPagePolicy('n0nce')).toContain(directive);
  });
});

describe('Tasks CSP report collector', () => {
  it('logs sanitized violations without query strings and answers 204', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { createBridge, handle } = setup();
    const response = await handle(
      new Request('https://tuturuuu.com/tasks/api/csp-report', {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body: JSON.stringify({
          'csp-report': {
            'document-uri':
              'https://tuturuuu.com/tasks/verify-token?nextUrl=%2Fsecret&token=abc',
            'blocked-uri': 'trusted-types-sink',
            'effective-directive': 'require-trusted-types-for',
            disposition: 'report',
          },
        }),
      }),
      {},
      ctx
    );
    expect(response.status).toBe(204);
    expect(createBridge).not.toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('https://tuturuuu.com/tasks/verify-token');
    expect(logged).not.toContain('token=abc');
    expect(logged).not.toContain('nextUrl');
    warn.mockRestore();
  });

  it('accepts Reporting API batches and ignores junk', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { handle } = setup();
    const batch = await handle(
      new Request('https://tasks.tuturuuu.com/api/csp-report', {
        method: 'POST',
        headers: { 'content-type': 'application/reports+json' },
        body: JSON.stringify([
          {
            type: 'csp-violation',
            body: {
              documentURL: 'https://tasks.tuturuuu.com/p?q=1#f',
              effectiveDirective: 'script-src-elem',
            },
          },
        ]),
      }),
      {},
      ctx
    );
    expect(batch.status).toBe(204);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('q=1');
    const junk = await handle(
      new Request('https://tasks.tuturuuu.com/api/csp-report', {
        method: 'POST',
        body: 'not json',
      }),
      {},
      ctx
    );
    expect(junk.status).toBe(204);
    const get = await handle(
      new Request('https://tasks.tuturuuu.com/api/csp-report'),
      {},
      ctx
    );
    expect(get.status).toBe(405);
    warn.mockRestore();
  });
});

describe('Tasks CSP report collector limits', () => {
  it('stops reading a chunked body past 16 KB and logs nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { handle } = setup();
    const chunk = new TextEncoder().encode('x'.repeat(8 * 1024));
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 64) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const response = await handle(
      new Request('https://tasks.tuturuuu.com/api/csp-report', {
        method: 'POST',
        body,
        // Node's Request needs `duplex` for a stream body.
        duplex: 'half',
      } as RequestInit),
      {},
      ctx
    );
    expect(response.status).toBe(204);
    expect(pulled).toBeLessThan(10);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never logs script samples, which can carry inline code', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { handle } = setup();
    await handle(
      new Request('https://tasks.tuturuuu.com/api/csp-report', {
        method: 'POST',
        body: JSON.stringify({
          'csp-report': {
            'document-uri': 'https://tasks.tuturuuu.com/p',
            'script-sample': 'secretInlineCode()',
          },
        }),
      }),
      {},
      ctx
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secretInlineCode');
    warn.mockRestore();
  });
});
