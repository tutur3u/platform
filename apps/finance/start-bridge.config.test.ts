import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { afterEach, describe, expect, it, vi } from 'vitest';

async function config() {
  vi.stubEnv('VITE_FINANCE_NATIVE_ROOT_HOST', 'finance.tuturuuu.com');
  vi.stubEnv('VITE_FINANCE_NATIVE_MOUNT_HOST', 'tuturuuu.com');
  return (await import('./start-bridge.config')).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Finance Worker mounts', () => {
  it('admits root and the slashless mount and refuses neighbouring paths/hosts', async () => {
    const app = await config();
    const mounts = { app: 'finance', basePath: '/finance', ...app.mounts };
    for (const path of ['/finance', '/finance/', '/finance/api/build-info']) {
      expect(
        resolveAppBase(new URL(`https://tuturuuu.com${path}`), mounts)
      ).toEqual({ mode: 'mounted', basePath: '/finance' });
    }
    expect(
      resolveAppBase(new URL('https://finance.tuturuuu.com/'), mounts)
    ).toEqual({ mode: 'root', basePath: '' });
    for (const url of [
      'https://tuturuuu.com/',
      'https://tuturuuu.com/finance-extra',
      'https://unknown.invalid/finance',
      'https://finance.tutur3u.com/',
    ]) {
      expect(resolveAppBase(new URL(url), mounts)).toBeNull();
    }
  });

  it('keeps both hosts closed without profile defines', async () => {
    vi.stubEnv('VITE_FINANCE_NATIVE_ROOT_HOST', '');
    vi.stubEnv('VITE_FINANCE_NATIVE_MOUNT_HOST', '');
    const app = (await import('./start-bridge.config')).default;
    expect(app.mounts?.rootHosts).toEqual([]);
    expect(app.mounts?.mountHosts).toEqual([]);
  });

  it.each(['', '/finance'])(
    'keeps static cache and framing boundaries at %s',
    async (base) => {
      const app = await config();
      const origin = base
        ? 'https://tuturuuu.com'
        : 'https://finance.tuturuuu.com';
      const wrap = (path: string, type: string, method = 'GET') =>
        app.wrapResponse!(
          new Response('fixture', {
            headers: {
              'content-type': type,
              'cache-control': 'public, max-age=60',
            },
          }),
          {
            request: new Request(`${origin}${base}${path}`, { method }),
            env: {} as never,
          }
        );
      expect(
        wrap('/favicon.ico', 'image/x-icon').headers.get('cache-control')
      ).toBe('public, max-age=60');
      expect(
        wrap('/assets/client.js', 'text/javascript').headers.get(
          'cache-control'
        )
      ).toBe('public, max-age=60');
      for (const response of [
        wrap('/assets/client.js', 'text/html'),
        wrap('/assets/client.js', 'text/javascript', 'POST'),
        wrap('/api/build-info', 'application/json'),
      ]) {
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('vary')).toContain('Cookie');
      }
      const webgl = '/api/v1/workspaces/ws/external-projects/assets/id/webgl';
      expect(
        wrap(webgl, 'text/html').headers.get('x-frame-options')
      ).toBeNull();
      expect(
        wrap(`${webgl}-extra`, 'text/html').headers.get('x-frame-options')
      ).toBe('DENY');
    }
  );
});
