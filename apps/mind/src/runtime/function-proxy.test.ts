import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shared: vi.fn(),
  refresh: vi.fn(),
  reject: vi.fn(),
}));
vi.mock('../../../../packages/start-bridge/src/next/function-proxy', () => ({
  createFunctionProxy: () => mocks.shared,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  refreshAppSessionForRequest: mocks.refresh,
  appSessionFailureResponse: () =>
    NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  propagateAuthCookies: vi.fn(),
}));
vi.mock('./mounted-bearer', async () => ({
  ...(await vi.importActual<typeof import('./mounted-bearer')>(
    './mounted-bearer'
  )),
  refusesMountedAuthorization: mocks.reject,
}));
import { createFunctionProxy } from './function-proxy';

describe('Mind mounted server-function authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shared.mockResolvedValue(NextResponse.next());
    mocks.refresh.mockResolvedValue({
      ok: true,
      response: NextResponse.next(),
    });
    mocks.reject.mockReturnValue(false);
  });
  it.each(['', 'mind_locale=en', 'sb-fixture-auth-token=invalid'])(
    'uses strict mode for any Cookie header %j, even with a bearer',
    async (cookie) => {
      const req = new NextRequest('https://tuturuuu.com/mind/_serverFn/id', {
        nextConfig: { basePath: '/mind' },
        headers: { cookie, authorization: 'Bearer fixture' },
      });
      await createFunctionProxy({ targetApp: 'mind' })(req);
      expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(req, {
        sessionMode: 'supabase-only',
        targetApp: 'mind',
      });
      expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(req);
    }
  );
  it('keeps explicit request-only bearers on their existing endpoint verification path', async () => {
    const req = new NextRequest('https://tuturuuu.com/mind/_serverFn/id', {
      nextConfig: { basePath: '/mind' },
      headers: { authorization: 'Bearer coordination' },
    });
    await createFunctionProxy({ targetApp: 'mind' })(req);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(req);
  });
  it('refuses a mounted Authorization before shared dispatch', async () => {
    mocks.reject.mockReturnValue(true);
    const req = new NextRequest('https://tuturuuu.com/mind/_serverFn/id', {
      nextConfig: { basePath: '/mind' },
      headers: { authorization: 'Bearer legacy' },
    });
    const response = await createFunctionProxy({ targetApp: 'mind' })(req);
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.shared).not.toHaveBeenCalled();
  });
  it('keeps root-host behavior unchanged', async () => {
    const req = new NextRequest('https://mind.tuturuuu.com/_serverFn/id');
    await createFunctionProxy({ targetApp: 'mind' })(req);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.shared).toHaveBeenCalledExactlyOnceWith(req);
  });
});
