import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlan, updatePlan } from './plans';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  membership: vi.fn(),
  insert: vi.fn(),
  admin: vi.fn(),
  update: vi.fn(),
  sessionClient: {},
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.auth,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => mocks.sessionClient,
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
    expect(mocks.admin).not.toHaveBeenCalled();
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
  it('checks MEMBER membership for the actor and workspace only', async () => {
    await createPlan({ ws_id: 'workspace' });
    expect(mocks.membership).toHaveBeenCalledTimes(1);
    const args = mocks.membership.mock.calls[0]?.[0];
    expect(args).toEqual({
      supabase: mocks.sessionClient,
      userId: 'actor',
      wsId: 'workspace',
    });
    expect(args).not.toHaveProperty('requiredType');
  });
  it('skips the membership check for a plan without a workspace', async () => {
    await createPlan({});
    expect(mocks.membership).not.toHaveBeenCalled();
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

describe('plan updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: 'actor' } });
    mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
    mocks.admin.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { creator_id: 'actor', is_confirmed: false },
            }),
          }),
        }),
        update: mocks.update,
      }),
    });
  });
  it('only writes editable fields', async () => {
    const result = await updatePlan('plan', {
      name: 'Renamed',
      description: 'Notes',
      ws_id: 'foreign',
      creator_id: 'someone-else',
      is_public: false,
    } as Parameters<typeof updatePlan>[1]);
    expect(result).toEqual({ data: { success: true } });
    expect(mocks.update).toHaveBeenCalledWith({
      name: 'Renamed',
      description: 'Notes',
    });
  });
});
