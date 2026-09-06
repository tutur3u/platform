import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './env';
import { platformProxy } from './platform-proxy';

const env = {
  APP_ORIGIN: 'https://colab.tuturuuu.com',
  AUTH_ORIGIN: 'https://tuturuuu.com',
} as Env;
const request = (path: string, origin = env.APP_ORIGIN) =>
  new Request(`${env.APP_ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie:
        'colab_session=private; sb-project-auth-token.0=central; unrelated=ignored',
    },
    body: '{}',
  });
afterEach(() => vi.unstubAllGlobals());
describe('first-party support bridge', () => {
  it('forwards only allowlisted paths and central auth cookies without changing auth failures', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'Unauthorized' }, { status: 401 })
      );
    vi.stubGlobal('fetch', fetcher);
    const response = await platformProxy(request('/api/reports'), env);
    expect(response?.status).toBe(401);
    expect(response?.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://tuturuuu.com/api/reports');
    expect(init.headers.get('cookie')).toBe('sb-project-auth-token.0=central');
    expect(await platformProxy(request('/api/admin'), env)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign origins, unsupported methods and oversized bodies before forwarding', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      platformProxy(request('/api/reports', 'https://attacker.example'), env)
    ).rejects.toThrow('invalid_origin');
    await expect(
      platformProxy(new Request(`${env.APP_ORIGIN}/api/reports`), env)
    ).rejects.toThrow('method_not_allowed');
    await expect(
      platformProxy(
        new Request(`${env.APP_ORIGIN}/api/reports`, {
          method: 'POST',
          headers: {
            Origin: env.APP_ORIGIN,
            'Content-Type': 'application/json',
          },
          body: 'x'.repeat(32001),
        }),
        env
      )
    ).rejects.toThrow('payload_too_large');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
