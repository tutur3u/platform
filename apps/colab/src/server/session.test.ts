import { afterEach, expect, it, vi } from 'vitest';
import { sign, verify } from './auth';
import type { Env } from './env';
import { resolveSession } from './session';

const env = {
  COLAB_SESSION_SECRET: 'test-only-session-secret-with-at-least-32-characters',
  APP_ORIGIN: 'https://colab.tuturuuu.com',
  AUTH_ORIGIN: 'https://tuturuuu.com',
} as Env;
const account = {
  id: 'user',
  email: 'real@example.com',
  name: 'Profile name',
  profileHydrated: true,
  expires: Date.now() + 60_000,
};
const request = async (identity = account, central = true) =>
  new Request(`${env.APP_ORIGIN}/api/session`, {
    headers: {
      Cookie: `colab_session=${await sign(identity, env.COLAB_SESSION_SECRET)}; ${central ? 'sb-project-auth-token.0=central;' : ''} unrelated=private`,
    },
  });
const user = {
  id: account.id,
  email: account.email,
  email_confirmed_at: '2026-01-01',
  user_metadata: { email: 'fake@tuturuuu.com', full_name: 'Verified name' },
};
afterEach(() => vi.unstubAllGlobals());
it('renews near-expiry sessions only from the verified central identity and forwards rotated auth cookies', async () => {
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    'sb-project-auth-token.0=rotated; Domain=.tuturuuu.com; Path=/; Secure'
  );
  headers.append('Set-Cookie', 'unrelated=do-not-forward; Path=/');
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ user }, { headers }));
  vi.stubGlobal('fetch', fetcher);
  const cookies: string[] = [];
  const result = await resolveSession(await request(), env, cookies);
  expect(result).toMatchObject({
    id: account.id,
    email: account.email,
    name: account.name,
  });
  expect(result!.expires).toBeGreaterThan(Date.now() + 3500_000);
  expect(fetcher.mock.calls[0]![1].headers.Cookie).toBe(
    'sb-project-auth-token.0=central'
  );
  expect(String(fetcher.mock.calls[0]![0])).toBe(
    'https://tuturuuu.com/api/auth/me'
  );
  expect(
    cookies.some((value) => value.startsWith('sb-project-auth-token.0=rotated'))
  ).toBe(true);
  expect(cookies.join(';')).not.toContain('unrelated');
  const token = cookies
    .find((value) => value.startsWith('colab_session='))!
    .split(';')[0]!
    .slice('colab_session='.length);
  expect(await verify(token, env.COLAB_SESSION_SECRET)).toEqual(result);
});
it('recovers expired sessions, but never trusts an expired Colab identity without central credentials', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ user }));
  vi.stubGlobal('fetch', fetcher);
  const expired = { ...account, expires: Date.now() - 1 };
  expect(
    await resolveSession(await request(expired, false), env, [])
  ).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  expect(await resolveSession(await request(expired), env, [])).toMatchObject({
    id: account.id,
    email: account.email,
  });
});
it('restores the central profile after cookie expiry and uses rotated credentials for the profile read', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { user },
        {
          headers: {
            'Set-Cookie': 'sb-project-auth-token.0=rotated; Path=/; Secure',
          },
        }
      )
    )
    .mockResolvedValueOnce(
      Response.json({
        id: user.id,
        display_name: 'Tuturuuu profile name',
        avatar_url: 'https://example.com/avatar.png',
      })
    );
  vi.stubGlobal('fetch', fetcher);
  const result = await resolveSession(
    await request({ ...account, expires: Date.now() - 1 }),
    env,
    []
  );
  expect(result).toMatchObject({
    name: 'Tuturuuu profile name',
    avatarUrl: 'https://example.com/avatar.png',
    profileHydrated: true,
  });
  expect(String(fetcher.mock.calls[1]![0])).toBe(
    'https://tuturuuu.com/api/v1/users/me/profile'
  );
  expect(fetcher.mock.calls[1]![1].headers.Cookie).toBe(
    'sb-project-auth-token.0=rotated'
  );
});
it('keeps a verified session usable when profile enrichment is unavailable', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ user }))
      .mockRejectedValueOnce(new Error('profile unavailable'))
  );
  expect(await resolveSession(await request(), env, [])).toMatchObject({
    id: account.id,
    name: account.name,
    profileHydrated: false,
  });
});
it('does not refresh healthy account sessions or extend guest credentials', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const healthy = { ...account, expires: Date.now() + 3600_000 };
  expect(await resolveSession(await request(healthy), env, [])).toEqual(
    healthy
  );
  const guest = {
    ...account,
    id: 'guest:one',
    email: null,
    expires: Date.now() + 1000,
  };
  const req = new Request(env.APP_ORIGIN, {
    headers: {
      Cookie: `colab_session=${await sign(guest, env.COLAB_SESSION_SECRET)}; sb-project-auth-token.0=central`,
    },
  });
  expect(await resolveSession(req, env, [])).toEqual(guest);
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects revoked, banned and unconfirmed central accounts', async () => {
  for (const response of [
    Response.json({}, { status: 401 }),
    Response.json({
      user: {
        ...user,
        banned_until: new Date(Date.now() + 3600_000).toISOString(),
      },
    }),
    Response.json({ user: { ...user, email_confirmed_at: null } }),
  ]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const cookies: string[] = [];
    expect(await resolveSession(await request(), env, cookies)).toBeNull();
    expect(cookies.join(';')).toContain('Max-Age=0');
  }
});
it('reports outages as retryable errors without clearing the session', async () => {
  for (const fetcher of [
    vi.fn().mockRejectedValue(new Error('offline')),
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    vi.fn().mockResolvedValue(Response.json({ malformed: true })),
  ]) {
    vi.stubGlobal('fetch', fetcher);
    const cookies: string[] = [];
    await expect(
      resolveSession(await request(), env, cookies)
    ).rejects.toMatchObject({ code: 'session_unavailable', status: 503 });
    expect(cookies).toEqual([]);
  }
});
