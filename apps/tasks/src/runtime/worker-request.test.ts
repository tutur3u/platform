import { describe, expect, it, vi } from 'vitest';
import { PAGE_REWRITE_HEADER } from '../lib/page-rewrite';
import {
  createTasksRequestHandler,
  denyFraming,
  type TasksBridgeHandler,
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

describe('Tasks Worker request step (root-only, fail-closed)', () => {
  it.each([
    'https://tuturuuu.com/tasks/personal/tasks',
    'https://tuturuuu.com/api/build-info',
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
      mountHosts: [],
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
