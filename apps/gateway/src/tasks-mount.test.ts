import { afterEach, describe, expect, it, vi } from 'vitest';
import { manifest } from './manifest';
import { withWebRest } from './web-rest.test-helper';
import { type CacheLike, createHandler, type Env } from './worker';

class MemoryCache implements CacheLike {
  entries = new Map<string, Response>();
  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }
}

function handler() {
  const cache = new MemoryCache();
  return createHandler({ cache: () => cache, now: () => 0, manifest });
}

function tasksEnv(paths = '/tasks,/tasks/*') {
  const fetch = vi.fn(async (_request: Request) => new Response('tasks'));
  const env = {
    PUBLIC_HOST: 'tuturuuu.com',
    ...withWebRest(),
    GATEWAY_MOUNTED_PATHS: paths,
    MOUNT_TASKS: { fetch },
  } as unknown as Env;
  return { env, fetch };
}

function stubWeb() {
  const web = vi.fn(async () => new Response('web'));
  vi.stubGlobal('fetch', web);
  return web;
}

afterEach(() => vi.unstubAllGlobals());

describe('Tasks mount', () => {
  it.each([
    '/tasks',
    '/tasks/',
    '/tasks/vi',
    '/tasks/en/personal/boards/b1',
    '/tasks/personal/tasks/t1',
    '/tasks/verify-token',
    '/tasks/api/v1/workspaces/personal/tasks',
    '/tasks/_serverFn/abc',
    '/tasks/assets/app-abc.js',
    '/tasks/manifest.webmanifest',
  ])('dispatches %s to Tasks with its original URL', async (path) => {
    const { env, fetch } = tasksEnv();
    const web = stubWeb();
    const url = `https://tuturuuu.com${path}?ref=a&ref=b`;
    const response = await handler()(new Request(url), env);
    expect(response.headers.get('x-gateway-cache')).toBe('MOUNT');
    expect(fetch.mock.calls[0]?.[0].url).toBe(url);
    expect(web).not.toHaveBeenCalled();
  });

  it('forwards a mutation unchanged, minus client forwarding headers', async () => {
    const { env, fetch } = tasksEnv();
    stubWeb();
    const response = await handler()(
      new Request('https://tuturuuu.com/tasks/_serverFn/move-task', {
        method: 'POST',
        body: '{"taskId":"t1"}',
        headers: {
          'content-type': 'application/json',
          cookie: 'sb-access=1',
          origin: 'https://tuturuuu.com',
          'x-forwarded-host': 'evil.example',
          'x-tuturuuu-app-base': '/evil',
          'x-tuturuuu-account-action': '1',
        },
      }),
      env
    );
    expect(response.headers.get('x-gateway-cache')).toBe('MOUNT');
    const forwarded = fetch.mock.calls[0]?.[0] as Request;
    expect(forwarded.method).toBe('POST');
    expect(await forwarded.text()).toBe('{"taskId":"t1"}');
    expect(forwarded.headers.get('cookie')).toBe('sb-access=1');
    expect(forwarded.headers.get('origin')).toBe('https://tuturuuu.com');
    expect(forwarded.headers.get('x-forwarded-host')).toBeNull();
    expect(forwarded.headers.get('x-tuturuuu-app-base')).toBeNull();
    expect(forwarded.headers.get('x-tuturuuu-account-action')).toBe('1');
  });

  it.each([
    // Web's own workspace task pages and APIs are not the Tasks mount.
    '/personal/tasks',
    '/en/personal/tasks',
    '/api/v1/workspaces/personal/tasks',
    // Lookalikes.
    '/tasksx',
    '/tasks-board',
    '/en/tasks-board',
  ])('leaves %s with Web', async (path) => {
    const { env, fetch } = tasksEnv();
    const web = stubWeb();
    const response = await handler()(
      new Request(`https://tuturuuu.com${path}`),
      env
    );
    expect(response.headers.get('x-gateway-cache')).not.toBe('MOUNT');
    expect(fetch).not.toHaveBeenCalled();
    expect(web).toHaveBeenCalled();
  });

  it('serves nothing from Tasks on another host or without the binding', async () => {
    const { env, fetch } = tasksEnv();
    stubWeb();
    await handler()(new Request('https://tasks.tuturuuu.com/tasks'), env);
    const unbound = { ...env, MOUNT_TASKS: undefined } as unknown as Env;
    const response = await handler()(
      new Request('https://tuturuuu.com/tasks/personal'),
      unbound
    );
    expect(response.headers.get('x-gateway-cache')).not.toBe('MOUNT');
    expect(fetch).not.toHaveBeenCalled();
  });
});
