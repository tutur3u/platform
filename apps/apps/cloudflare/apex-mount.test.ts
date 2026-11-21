// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { appPath, runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({
    fetch: async () =>
      Response.json({
        base: runtimeAppBase(),
        asset: appPath('/assets/chunk.js'),
        locale: appPath('/messages/vi.json'),
      }),
  }),
}));
vi.mock('../src/native/api.server', () => ({
  apiRequest: async (request: Request) =>
    Response.json({ path: new URL(request.url).pathname }),
}));
import { appsRequest } from './worker';
const env = {
  ASSETS: {
    fetch: async (request: Request | string) =>
      new Response(
        new URL(typeof request === 'string' ? request : request.url).pathname
      ),
  },
  APPS_CANONICAL_HOST_ENABLED: '1',
};
describe('Apps apex mount', () => {
  it.each([
    [
      'https://tuturuuu.com/apps/en/x?tag=1&tag=2',
      '/apps',
      'https://tuturuuu.com/apps/x?tag=1&tag=2',
    ],
    ['https://apps.tuturuuu.com/en/x', '/', 'https://apps.tuturuuu.com/x'],
  ])('scopes locale redirects at %s', async (url, path, location) => {
    const result = await appsRequest(new Request(url), env);
    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toBe(location);
    expect(result.headers.get('set-cookie')).not.toMatch(/domain=/i);
    expect(result.headers.get('set-cookie')).toContain(`Path=${path};`);
  });
  it('serves catalogue and assets at the mount without a subdomain redirect', async () => {
    const catalogue = await appsRequest(
      new Request('https://tuturuuu.com/apps'),
      env
    );
    expect(await catalogue.json()).toEqual({
      base: '/apps',
      asset: '/apps/assets/chunk.js',
      locale: '/apps/messages/vi.json',
    });
    expect(catalogue.headers.get('location')).toBeNull();
    expect(catalogue.headers.get('x-robots-tag')).toBeNull();
    expect(
      await (
        await appsRequest(
          new Request('https://tuturuuu.com/apps/assets/chunk.js'),
          env
        )
      ).text()
    ).toBe('/assets/chunk.js');
    // On the shared origin `/api` belongs to Web; the mount forwards none.
    expect(
      (
        await appsRequest(
          new Request('https://tuturuuu.com/apps/api/example'),
          env
        )
      ).status
    ).toBe(404);
  });
  it('preserves subdomain root and staging noindex override', async () => {
    const root = await appsRequest(
      new Request('https://apps.tuturuuu.com/'),
      env
    );
    expect(await root.json()).toEqual({
      base: '',
      asset: '/assets/chunk.js',
      locale: '/messages/vi.json',
    });
    const staging = await appsRequest(
      new Request('https://tuturuuu.com/apps'),
      { ...env, TUTURUUU_NOINDEX: '1' }
    );
    expect(staging.headers.get('x-robots-tag')).toContain('noindex');
    const privatePath = await appsRequest(
      new Request('https://tuturuuu.com/apps/unknown'),
      env
    );
    expect(privatePath.headers.get('x-robots-tag')).toContain('noindex');
  });
});
