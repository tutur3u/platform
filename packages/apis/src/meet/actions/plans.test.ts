import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlan } from './plans';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  membership: vi.fn(),
  insert: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.auth,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@tuturuuu/utils/time-helper', () => ({
  parseTimeFromTimetz: () => undefined,
}));
describe('plan creation access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'actor' } });
    mocks.membership.mockResolvedValue({ ok: true, membershipType: 'MEMBER' });
    mocks.insert.mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: 'plan' }, error: null }),
      }),
    });
    mocks.admin.mockResolvedValue({ from: () => ({ insert: mocks.insert }) });
  });
  it('requires a signed-in creator', async () => {
    mocks.auth.mockResolvedValue({ user: null });
    expect(await createPlan({})).toEqual({ error: 'Not authenticated' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('requires membership before a workspace insert', async () => {
    mocks.membership.mockResolvedValue({
      ok: false,
      error: 'membership_missing',
    });
    expect(await createPlan({ ws_id: 'foreign' })).toEqual({
      error: 'Forbidden',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('fails closed on a membership lookup failure', async () => {
    mocks.membership.mockResolvedValue({
      ok: false,
      error: 'membership_lookup_failed',
    });
    expect(await createPlan({ ws_id: 'workspace' })).toEqual({
      error: 'Failed to verify workspace access',
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each([{}, { ws_id: 'workspace' }])(
    'allows an authenticated creator %j',
    async (input) => {
      expect(await createPlan(input)).toEqual({ data: { id: 'plan' } });
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({ creator_id: 'actor' })
      );
    }
  );
});
