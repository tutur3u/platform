// @vitest-environment node

import { guardBrowserApiSession } from '@tuturuuu/utils/required-mfa-api-session';
import { enforceRequiredMfaRequest } from '@tuturuuu/utils/required-mfa-runtime';
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from '@/legacy-api-routes/v1/mira/pet/route';

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  getUser: vi.fn(),
  updateSession: vi.fn(),
  required: true,
}));
vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: mocks.updateSession,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      getClaims: async () => ({
        data: {
          claims: { sub: 'cookie-user', aal: 'aal1', session_id: 'session' },
        },
        error: null,
      }),
    },
    rpc: mocks.adminRpc,
    from: emptyQuery,
    schema: () => ({}),
  }),
  // The real legacy route deliberately ignores the incoming Bearer header.
  createClient: async () => ({
    auth: { getUser: () => mocks.getUser('eyJcookie') },
    from: emptyQuery,
  }),
}));
function emptyQuery() {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'not', 'order', 'limit'])
    builder[method] = () => builder;
  builder.maybeSingle = async () => ({ data: null, error: null });
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are deliberately awaitable.
  builder.then = (resolve: (value: unknown) => void) =>
    resolve({ data: [], error: null });
  return builder;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.required = true;
  vi.stubEnv('SUPABASE_SERVER_URL', 'http://internal:8001');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  mocks.getUser.mockImplementation(async (token: string) => ({
    data: {
      user: {
        id: token === 'eyJcookie' ? 'cookie-user' : 'bearer-user',
        app_metadata:
          token === 'eyJcookie' && mocks.required
            ? { tuturuuu_required_mfa: { required: true, verifiedAfter: 100 } }
            : {},
      },
    },
    error: null,
  }));
  mocks.adminRpc.mockResolvedValue({
    data: { owner: 'cookie-user' },
    error: null,
  });
});
async function dispatch(
  authorization: string,
  cookieKey = 'sb-project-auth-token'
) {
  const req = new NextRequest('https://tuturuuu.com/api/v1/mira/pet', {
    headers: {
      authorization,
      cookie: `${cookieKey}=${JSON.stringify({ access_token: 'eyJcookie' })}`,
    },
  });
  const response = await guardBrowserApiSession(req, () =>
    enforceRequiredMfaRequest(req)
  );
  return response.headers.get('x-middleware-next') === '1' ? GET() : response;
}
it.each(['Bearer opaque', 'Bearer eyJoptional'])(
  'rejects cookie-principal access despite unrelated %s',
  async (authorization) => {
    const response = await dispatch(authorization);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  }
);
it('keeps the real cookie-only route working for optional policy', async () => {
  mocks.required = false;
  const response = await dispatch('Bearer opaque');
  expect(response.status).toBe(200);
  expect(mocks.adminRpc).toHaveBeenCalledWith('get_or_create_mira_pet', {
    p_user_id: 'cookie-user',
  });
});

it('checks an internal provider-cookie alias before the cookie-only route', async () => {
  const response = await dispatch('Bearer opaque', 'sb-internal-auth-token');
  expect(response.status).toBe(403);
  expect(mocks.adminRpc).not.toHaveBeenCalled();
});
