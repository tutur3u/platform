import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  auth: vi.fn(),
  session: vi.fn(),
  access: vi.fn(),
  propagate: vi.fn(),
  guard: vi.fn(),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: f.guard,
}));
vi.mock('@tuturuuu/auth/supabase-session-user', () => ({
  resolveSupabaseSessionRequest: f.session,
}));
vi.mock('@tuturuuu/auth/proxy', () => ({
  createCentralizedAuthProxy: () => f.auth,
  getRequestHeadersWithResponseCookies: (request: Request) => request.headers,
  propagateAuthCookies: f.propagate,
}));
vi.mock('@tuturuuu/meet-core/constants/common', () => ({
  TTR_URL: 'http://localhost:7803',
}));
vi.mock('@tuturuuu/meet-core/parley-access', () => ({
  hasParleyAccess: f.access,
}));
vi.mock('./i18n/routing', () => ({
  routing: { locales: ['en', 'vi'], defaultLocale: 'en' },
}));
vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

import proxy from './proxy';

const request = (path: string) =>
  new NextRequest(`http://localhost:7834${path}`);
beforeEach(() => {
  vi.resetAllMocks();
  f.auth.mockResolvedValue(NextResponse.next());
  f.session.mockResolvedValue({ user: { id: 'verified-user' } });
  f.access.mockResolvedValue(true);
  f.guard.mockResolvedValue(null);
});
it('requires eligibility with a verified shared Supabase session', async () => {
  f.access.mockResolvedValue(false);
  const response = await proxy(request('/r/code'));
  expect(response.headers.get('location')).toBe(
    'http://localhost:7834/access-denied'
  );
  expect(f.access).toHaveBeenCalledWith('verified-user');
});
it('rejects API requests after allowlist revocation', async () => {
  f.access.mockResolvedValue(false);
  expect((await proxy(request('/api/meet-call/room/token'))).status).toBe(403);
});
it('rejects API requests without a verified provider session', async () => {
  f.session.mockResolvedValue({ user: null });
  expect((await proxy(request('/api/meet-call/room/token'))).status).toBe(401);
});
it('fails closed when the fresh eligibility lookup fails', async () => {
  f.access.mockRejectedValue(new Error('database unavailable'));
  expect((await proxy(request('/'))).status).toBe(503);
});
it('allows only the exact auth callback routes without a session', async () => {
  f.session.mockResolvedValue({ user: null });
  expect((await proxy(request('/api/auth/verify-app-token'))).status).toBe(200);
  expect(f.auth).not.toHaveBeenCalled();
  expect(
    (await proxy(request('/api/auth/verify-app-token/extra'))).status
  ).toBe(401);
});
it('preserves refreshed shared cookies on admitted requests', async () => {
  const response = await proxy(request('/'));
  expect(response.status).toBe(200);
  expect(f.propagate).toHaveBeenCalledOnce();
});
it('preserves central login redirects', async () => {
  f.auth.mockResolvedValue(
    NextResponse.redirect('http://localhost:7803/login')
  );
  expect((await proxy(request('/'))).headers.get('location')).toBe(
    'http://localhost:7803/login'
  );
  expect(f.access).not.toHaveBeenCalled();
});

it('returns 401 for APIs when central authentication or MFA is required', async () => {
  f.auth.mockResolvedValue(
    NextResponse.redirect('http://localhost:7803/login?mfa=required')
  );
  expect((await proxy(request('/api/meet-call/room/token'))).status).toBe(401);
  expect(f.access).not.toHaveBeenCalled();
});

it('does not bypass an unavailable MFA or provider assurance check', async () => {
  f.auth.mockResolvedValue(
    NextResponse.json({ error: 'Assurance unavailable' }, { status: 503 })
  );
  expect((await proxy(request('/sessions'))).status).toBe(503);
  expect(f.session).not.toHaveBeenCalled();
  expect(f.access).not.toHaveBeenCalled();
});
