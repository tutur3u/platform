import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  request: vi.fn(),
  ambient: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/request/server', () => ({
  createRequestClient: f.request,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createClient: f.ambient }));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: f.resolve,
}));

import { resolveSupabaseSessionRequest } from './supabase-session-user';

beforeEach(() => {
  vi.resetAllMocks();
  f.ambient.mockRejectedValue(
    new Error('cookies called outside a request scope')
  );
  f.request.mockResolvedValue({ auth: {} });
  f.resolve.mockResolvedValue({
    user: { id: 'verified-user' },
    authError: null,
  });
});
it('authenticates an explicit proxy request without Next ambient request storage', async () => {
  const request = new Request('https://parley.tuturuuu.com/en', {
    headers: { cookie: 'synthetic=refreshed' },
  });
  const result = await resolveSupabaseSessionRequest(request);
  expect(result.user?.id).toBe('verified-user');
  expect(f.request).toHaveBeenCalledWith(request);
  expect(f.ambient).not.toHaveBeenCalled();
});
it('keeps ambient cookie auth for server components without an explicit request', async () => {
  f.ambient.mockResolvedValue({ auth: {} });
  expect((await resolveSupabaseSessionRequest()).user?.id).toBe(
    'verified-user'
  );
  expect(f.request).not.toHaveBeenCalled();
});
it('fails closed when the provider rejects the request session', async () => {
  f.resolve.mockResolvedValue({
    user: null,
    authError: new Error('Session revoked'),
  });
  const result = await resolveSupabaseSessionRequest(
    new Request('https://parley.tuturuuu.com/en')
  );
  expect(result.user).toBeNull();
  expect(result.authError?.message).toBe('Session revoked');
});
