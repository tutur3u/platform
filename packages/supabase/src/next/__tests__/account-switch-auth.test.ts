import { stringToBase64URL } from '@supabase/ssr';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createAccountSwitchAuth,
  clearAccountSwitchSession,
} from '../account-switch-auth';
const state = vi.hoisted(() => ({
  cookies: new Array<{ name: string; value: string }>(),
  response: new Headers(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => state.cookies,
    set: (name: string, value: string) =>
      state.response.append('set-cookie', `${name}=${value}`),
  }),
}));
const user = {
  id: 'account-b',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'synthetic@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
function jwt(exp: number) {
  return `${stringToBase64URL(JSON.stringify({ alg: 'HS256' }))}.${stringToBase64URL(JSON.stringify({ sub: user.id, exp }))}.c3ludGhldGlj`;
}
const tokens = () => ({
  access_token: jwt(Math.floor(Date.now() / 1000) + 3600),
  refresh_token: 'synthetic-new-refresh',
  expires_in: 3600,
  token_type: 'bearer',
  user,
});
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key');
  const outgoing = {
    ...tokens(),
    access_token: jwt(1),
    expires_at: 1,
    user: { ...user, id: 'account-a' },
  };
  state.cookies = [
    {
      name: 'sb-test-auth-token',
      value: `base64-${stringToBase64URL(JSON.stringify(outgoing))}`,
    },
  ];
  state.response = new Headers();
});
afterEach(() => vi.unstubAllEnvs());
it('purely reads expired outgoing cookies, refreshes detached once, and emits nothing before commit', async () => {
  const transport = vi.fn<typeof fetch>(async (input) => {
    const target = new URL(String(input));
    if (target.pathname.endsWith('/token')) return Response.json(tokens());
    if (target.pathname.endsWith('/user')) return Response.json(user);
    throw new Error('Unexpected provider endpoint');
  });
  const auth = await createAccountSwitchAuth(
    new Request('https://tuturuuu.com'),
    transport
  );
  expect((await auth.readOutgoing())?.user.id).toBe('account-a');
  expect(transport).not.toHaveBeenCalled();
  const result = await auth.refreshTarget({
    access_token: jwt(1),
    refresh_token: 'synthetic-expired',
  });
  expect(result.error).toBeNull();
  expect(state.response.getSetCookie()).toEqual([]);
  const second = await auth.refreshTarget({
    access_token: jwt(1),
    refresh_token: 'synthetic-expired',
  });
  expect(second.error).not.toBeNull();
  expect(
    transport.mock.calls.filter(([u]) => String(u).includes('/token'))
  ).toHaveLength(1);
  expect(state.response.getSetCookie()).toEqual([]);
  if (!result.data.session) throw new Error('No refreshed session');
  await auth.commit(result.data.session);
  expect(state.response.getSetCookie().length).toBeGreaterThan(0);
  expect(
    transport.mock.calls.filter(([u]) => String(u).includes('/token'))
  ).toHaveLength(1);
});
it('bounds a retryable provider failure to one HTTP refresh and no cookies', async () => {
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({ error: 'temporarily_unavailable' }, { status: 503 })
  );
  const auth = await createAccountSwitchAuth(
    new Request('https://tuturuuu.com'),
    transport
  );
  expect(
    (
      await auth.refreshTarget({
        access_token: jwt(1),
        refresh_token: 'synthetic',
      })
    ).error
  ).not.toBeNull();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(state.response.getSetCookie()).toEqual([]);
});
it('clears the browser auth cookies without any provider operation', async () => {
  await clearAccountSwitchSession(new Request('https://tuturuuu.com'));
  expect(state.response.getSetCookie()).toContain('sb-test-auth-token=');
});
