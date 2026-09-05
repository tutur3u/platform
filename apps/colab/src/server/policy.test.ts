import { seedRecords } from '@tuturuuu/multiplayer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeMockTool } from './ai';
import { authRoute, sign, verify } from './auth';
import type { Env } from './env';

const alice = {
  id: 'alice',
  email: 'alice@example.com',
  name: 'Ngọc',
  expires: Date.now() + 86400000,
};
describe('sandbox and sessions', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('identifies the Worker to the central API guard and completes the callback', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        valid: true,
        userId: alice.id,
        email: alice.email,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      })
    );
    vi.stubGlobal('fetch', fetcher);
    const env = {
      APP_ORIGIN: 'https://colab.tuturuuu.com',
      AUTH_ORIGIN: 'https://tuturuuu.com',
      COLAB_SESSION_SECRET: 'test-only-secret-with-at-least-32-characters',
    } as Env;
    const response = await authRoute(
      new Request(
        'https://colab.tuturuuu.com/auth/callback?state=nonce&token=handoff',
        { headers: { Cookie: 'colab_login=nonce' } }
      ),
      env
    );
    expect(fetcher).toHaveBeenCalledWith(
      new URL('/api/v1/auth/colab/verify', env.AUTH_ORIGIN),
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'Tuturuuu-Colab/1.0',
        }),
      })
    );
    expect(response.headers.get('Location')).toBe('/');
    expect(response.headers.get('Set-Cookie')).toContain('colab_session=');
  });
  it('unwraps the first-party token handoff without allowing external redirects', async () => {
    const env = { APP_ORIGIN: 'https://colab.tuturuuu.com' } as Env;
    const url = new URL('/verify-token', env.APP_ORIGIN);
    url.searchParams.set('nextUrl', '/auth/callback?state=nonce');
    url.searchParams.set('token', 'one-time-token');
    const response = await authRoute(new Request(url), env);
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe(
      'https://colab.tuturuuu.com/auth/callback?state=nonce&token=one-time-token'
    );
    url.searchParams.set('nextUrl', 'https://attacker.example/auth/callback');
    await expect(authRoute(new Request(url), env)).rejects.toThrow(
      'invalid_login'
    );
    await expect(
      authRoute(
        new Request(
          'https://colab.tuturuuu.com/auth/callback?state=nonce&token=x'
        ),
        env
      )
    ).rejects.toThrow('invalid_login');
  });
  it('can only read/write allowlisted in-memory mock apps', () => {
    const records = seedRecords();
    const other = seedRecords();
    expect(
      JSON.parse(
        executeMockTool(records, {
          tool: 'search',
          app: 'drive',
          query: 'Lotus',
        })
      )
    ).toHaveLength(1);
    expect(() =>
      executeMockTool(records, {
        tool: 'fetch',
        app: 'drive',
        url: 'https://example.com',
      })
    ).toThrow('unknown_tool');
    expect(() =>
      executeMockTool(records, { tool: 'read', app: 'jira', id: 'drive-1' })
    ).toThrow('mock_record_missing');
    executeMockTool(records, {
      tool: 'update',
      app: 'drive',
      id: 'drive-1',
      title: 'Changed',
      content: 'Simulation',
    });
    expect(other[0]!.title).toBe('Launch brief');
    expect(records[0]!.title).toBe('Changed');
    expect(() =>
      executeMockTool(records, {
        tool: 'create',
        app: 'email',
        title: 'x',
        content: 'x',
      })
    ).toThrow('unknown_mock_app');
  });
  it('verifies signatures, rejects expiry, and fails closed without secrets', async () => {
    const secret = 'test-only-secret-with-at-least-32-characters';
    const token = await sign(alice, secret);
    expect(await verify(token, secret)).toEqual(alice);
    expect(await verify(`${token}x`, secret)).toBeNull();
    expect(await verify(token, '')).toBeNull();
    expect(
      await verify(await sign({ ...alice, expires: 0 }, secret), secret)
    ).toBeNull();
  });
});
