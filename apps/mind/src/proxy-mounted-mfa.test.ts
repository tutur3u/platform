import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';
import { createFunctionProxy } from './runtime/function-proxy';

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  getUser: vi.fn(),
  functionDispatch: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/proxy', () => ({
  updateSession: mocks.updateSession,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ auth: { getUser: mocks.getUser } }),
  createClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: vi.fn(),
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));
vi.mock('next-intl/navigation', () => ({
  createNavigation: () => ({}),
}));
vi.mock('../../../packages/start-bridge/src/next/function-proxy', () => ({
  createFunctionProxy: () => mocks.functionDispatch,
}));

const user = {
  id: 'fixture-user',
  email: 'mind@example.test',
  email_confirmed_at: '2026-11-01T00:00:00Z',
  app_metadata: {},
  factors: [{ factor_type: 'totp', status: 'verified' }],
};
const providerCookie = Buffer.from(
  JSON.stringify({ access_token: 'eyJfixture-provider-token' })
).toString('base64url');

function request(path: string) {
  return new NextRequest(`https://tuturuuu.com/mind${path}`, {
    nextConfig: { basePath: '/mind' },
    headers: {
      cookie: `sb-fixture-auth-token=base64-${providerCookie}`,
      host: 'tuturuuu.com',
    },
  });
}

describe('mounted Mind provider assurance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.supabase.test');
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.functionDispatch.mockImplementation(() => NextResponse.next());
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['aal1', 403],
    ['aal2', 200],
  ] as const)(
    'applies %s to both a page and server function',
    async (aal, status) => {
      const now = Math.floor(Date.now() / 1000);
      mocks.updateSession.mockImplementation(async () => ({
        res: NextResponse.next(),
        claims: {
          sub: user.id,
          exp: now + 600,
          aal,
          session_id: 'fixture-session',
          amr: [
            { method: aal === 'aal2' ? 'totp' : 'password', timestamp: now },
          ],
        },
      }));

      const page = await proxy(request('/boards'));
      const runFunction = createFunctionProxy({ targetApp: 'mind' });
      const serverFunction = await runFunction(request('/_serverFn/id'));
      for (const [surface, response] of Object.entries({
        page,
        serverFunction,
      })) {
        expect(
          response.status,
          `${surface}: ${response.headers.get('location')}`
        ).toBe(status);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.getSetCookie()).toEqual([]);
      }
      if (status === 200) {
        expect(page.headers.get('x-middleware-next')).toBe('1');
        expect(mocks.functionDispatch).toHaveBeenCalledOnce();
      } else {
        expect(mocks.functionDispatch).not.toHaveBeenCalled();
      }
    }
  );
});
