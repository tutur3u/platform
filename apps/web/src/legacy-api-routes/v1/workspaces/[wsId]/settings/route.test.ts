import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ allowed: false, upsert: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (request: Request, context: unknown, params: unknown) => unknown
    ) =>
    (request: Request, context: { params: unknown }) =>
      handler(
        request,
        { user: { id: 'member' }, supabase: {} },
        context.params
      ),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
  getPermissions: async () => ({
    wsId: 'workspace',
    containsPermission: () => mocks.allowed,
    withoutPermission: () => !mocks.allowed,
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: () => ({ upsert: mocks.upsert }) }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = false;
  mocks.upsert.mockReturnValue({
    select: () => ({ single: async () => ({ data: {}, error: null }) }),
  });
});
async function post(body: object) {
  const { POST } = await import('./route');
  return POST(
    new NextRequest('http://localhost/api/settings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: { wsId: 'workspace' } }
  );
}
describe('SR-221 workspace settings mutations', () => {
  it('denies members without settings management before upsert', async () => {
    expect((await post({ break_enabled: false })).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('rejects fields outside the editable settings allowlist', async () => {
    mocks.allowed = true;
    expect(
      (await post({ break_enabled: false, created_at: '2020-01-01' })).status
    ).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('preserves allowed settings updates for managers', async () => {
    mocks.allowed = true;
    expect((await post({ break_enabled: false })).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith({
      break_enabled: false,
      ws_id: 'workspace',
    });
  });
});
