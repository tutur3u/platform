import { describe, expect, it, vi } from 'vitest';
import { PAGE_REWRITE_HEADER } from '../lib/page-rewrite';
import { createTasksRequestHandler } from './worker-request';

const ctx = { waitUntil: vi.fn() };

function setup() {
  const bridge = vi.fn(
    async (request: Request) =>
      new Response(`bridge ${new URL(request.url).pathname}`)
  );
  return { bridge, handle: createTasksRequestHandler(bridge) };
}

function expectDecorated(response: Response) {
  expect(response.headers.get('x-tuturuuu-runtime')).toBe('native');
  expect(response.headers.get('content-security-policy')).toBe(
    "frame-ancestors 'none'"
  );
  expect(response.headers.get('x-frame-options')).toBe('DENY');
}

describe('Tasks Worker request step', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'answers apex /api/build-info outside the mount with 404 (%s)',
    async (method) => {
      const { bridge, handle } = setup();

      const response = await handle(
        new Request('https://tuturuuu.com/api/build-info', { method }),
        {},
        ctx
      );

      expect(response.status).toBe(404);
      expectDecorated(response);
      expect(bridge).not.toHaveBeenCalled();
    }
  );

  it('rejects any apex path outside /tasks without reaching the bridge', async () => {
    const { bridge, handle } = setup();

    const response = await handle(
      new Request('https://tuturuuu.com/tasksx/a'),
      {},
      ctx
    );

    expect(response.status).toBe(404);
    expect(bridge).not.toHaveBeenCalled();
  });

  it.each([
    ['root host', 'https://tasks.tuturuuu.com/api/build-info'],
    ['apex mount', 'https://tuturuuu.com/tasks/api/build-info'],
  ])('serves build-info at the %s', async (_label, url) => {
    const { bridge, handle } = setup();

    const get = await handle(new Request(url), {}, ctx);
    const head = await handle(new Request(url, { method: 'HEAD' }), {}, ctx);
    const options = await handle(
      new Request(url, { method: 'OPTIONS' }),
      {},
      ctx
    );

    expect(get.status).toBe(200);
    expect(((await get.json()) as { appName: string }).appName).toBe('tasks');
    expectDecorated(get);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(options.status).toBe(204);
    expect(bridge).not.toHaveBeenCalled();
  });

  it('hands mounted app paths to the bridge without a client page rewrite', async () => {
    const { bridge, handle } = setup();

    const response = await handle(
      new Request('https://tuturuuu.com/tasks/personal/tasks', {
        headers: { [PAGE_REWRITE_HEADER]: '/en/task-link-preview' },
      }),
      { TUTURUUU_NOINDEX: '1' },
      ctx
    );

    expect(await response.text()).toBe('bridge /tasks/personal/tasks');
    expect(bridge.mock.calls[0]?.[0].headers.has(PAGE_REWRITE_HEADER)).toBe(
      false
    );
    expectDecorated(response);
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
});
