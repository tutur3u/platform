// @vitest-environment node
import { runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appsRequest } from './worker';

const { start, api } = vi.hoisted(() => ({
  start: vi.fn<(request: Request) => Promise<Response>>(),
  api: vi.fn(),
}));

vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: start }),
}));
vi.mock('../src/native/api.server', () => ({ apiRequest: api }));

const env = {
  ASSETS: { fetch: vi.fn(async (_request: Request) => new Response('asset')) },
  APPS_CANONICAL_HOST_ENABLED: '1',
};

beforeEach(() => {
  vi.resetAllMocks();
  env.ASSETS.fetch.mockResolvedValue(new Response('asset'));
  vi.stubEnv('NODE_ENV', 'production');
});
afterEach(() => vi.unstubAllEnvs());

describe('Apps apex mount', () => {
  it('renders a bare mount with its query and request base', async () => {
    start.mockImplementation(async (request) => {
      expect(request.url).toBe('https://tuturuuu.com/apps?format=hex');
      expect(runtimeAppBase()).toBe('/apps');
      return new Response('Apps');
    });
    const response = await appsRequest(
      new Request('https://tuturuuu.com/apps?format=hex'),
      env
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('Apps');
  });

  it('keeps a locale redirect under the mount with its original query', async () => {
    const response = await appsRequest(
      new Request('https://tuturuuu.com/apps/vi/pay/a%2Fb?tag=1&tag=2'),
      env
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/apps/pay/a%2Fb?tag=1&tag=2'
    );
  });

  it('launches an app through the existing destination registry', async () => {
    const response = await appsRequest(
      new Request('https://tuturuuu.com/apps/pay/a%2Fb?tag=1&tag=2'),
      env
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://pay.tuturuuu.com/a%2Fb?tag=1&tag=2&source=apps'
    );
  });

  it('dispatches the mounted server function at its compiled path', async () => {
    start.mockImplementation(async (request) => {
      expect(request.url).toBe('https://tuturuuu.com/_serverFn/fixture?x=1');
      expect(await request.text()).toBe('payload');
      expect(runtimeAppBase()).toBe('/apps');
      return new Response('result');
    });
    const response = await appsRequest(
      new Request('https://tuturuuu.com/apps/_serverFn/fixture?x=1', {
        method: 'POST',
        body: 'payload',
      }),
      env
    );
    expect(await response.text()).toBe('result');
  });

  it('keeps the production mount disabled in the staging profile', async () => {
    const response = await appsRequest(
      new Request('https://tuturuuu.com/apps'),
      {
        ...env,
        APPS_CANONICAL_HOST_ENABLED: '0',
      }
    );
    expect(response.status).toBe(503);
    expect(start).not.toHaveBeenCalled();
  });

  it('strips the mount for static assets', async () => {
    const response = await appsRequest(
      new Request('https://tuturuuu.com/apps/assets/app.js'),
      env
    );
    expect(await response.text()).toBe('asset');
    expect(env.ASSETS.fetch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ url: 'https://tuturuuu.com/assets/app.js' })
    );
  });

  it.each([
    '/api/v1/users/me/profile',
    '/apps-other',
    '/apps/api/v1/users/me/profile',
  ])('rejects an unowned apex path %s', async (path) => {
    const response = await appsRequest(
      new Request(`https://tuturuuu.com${path}`),
      env
    );
    expect(response.status).toBe(404);
    expect(api).not.toHaveBeenCalled();
  });
});
