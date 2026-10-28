import { expect, it, vi } from 'vitest';

const { authorize, rpc } = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/lib/devboxes/authorization', () => ({
  authorizeDevboxRootAdmin: authorize,
}));
vi.mock('@/lib/devboxes/store-utils', () => ({
  createPrivateDevboxClient: async () => ({ rpc }),
  createDevboxRouteErrorResponse: () => new Response(null, { status: 503 }),
}));

import { POST } from './route';

const userId = '00000000-0000-4000-8000-00000000f001';
it('refuses non-admin callers before reaching storage', async () => {
  authorize.mockResolvedValue({
    ok: false,
    response: new Response(null, { status: 403 }),
  });
  const response = await POST(
    new Request('https://example.test', { method: 'POST' }),
    { params: Promise.resolve({ id: userId }) }
  );
  expect(response.status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
it('binds reinstatement to the authenticated admin', async () => {
  authorize.mockResolvedValue({ ok: true, user: { id: 'admin' } });
  rpc.mockResolvedValue({ data: true, error: null });
  const response = await POST(
    new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({ reinstate: true }),
    }),
    { params: Promise.resolve({ id: userId }) }
  );
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('reinstate_devbox_quota_grant', {
    p_user_id: userId,
    p_admin_id: 'admin',
  });
});
