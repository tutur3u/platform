import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUserById: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    rpc: mocks.rpc,
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));

import { POST } from './route';

const request = (token = 'a'.repeat(64)) =>
  new Request('https://tuturuuu.com/api/v1/auth/colab/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockResolvedValue({
    data: [
      { user_id: 'user', session_data: { email: 'spoofed@tuturuuu.com' } },
    ],
    error: null,
  });
  mocks.getUserById.mockResolvedValue({
    data: {
      user: {
        id: 'user',
        email: 'real@example.com',
        email_confirmed_at: '2026-01-01',
      },
    },
    error: null,
  });
});
it('uses verified auth email instead of caller-controlled session metadata', async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    userId: 'user',
    email: 'real@example.com',
    valid: true,
  });
  expect(mocks.rpc).toHaveBeenCalledWith(
    'validate_cross_app_token_with_session',
    { p_token: 'a'.repeat(64), p_target_app: 'colab' }
  );
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('rejects malformed, expired/replayed and unverified handoffs', async () => {
  expect((await POST(request('bad'))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
  expect((await POST(request())).status).toBe(401);
  mocks.getUserById.mockResolvedValueOnce({
    data: { user: { email: 'x@tuturuuu.com' } },
    error: null,
  });
  expect((await POST(request())).status).toBe(403);
});
