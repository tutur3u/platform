import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  createClientMock,
  getUserMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  getUserMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
  createClient: createClientMock,
}));

vi.mock('./workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

import { getPlan, normalizeMeetTogetherPlanId } from './plan-helpers';

function createPlanClient(result: { data: unknown; error: unknown }) {
  const eqCalls: Array<[string, unknown]> = [];
  const query = {
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return query;
    }),
    maybeSingle: vi.fn(async () => result),
    select: vi.fn(() => query),
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'meet_together_plans') {
        throw new Error(`unexpected table ${table}`);
      }

      return query;
    }),
  };

  return {
    client,
    eqCalls,
    query,
  };
}

describe('meet plan helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: {
        getUser: getUserMock,
      },
    });
    getUserMock.mockResolvedValue({
      data: { user: null },
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
  });

  it('normalizes compact legacy plan IDs', () => {
    expect(
      normalizeMeetTogetherPlanId('0123456789abcdef0123456789abcdef')
    ).toBe('01234567-89ab-cdef-0123-456789abcdef');
    expect(
      normalizeMeetTogetherPlanId('01234567-89ab-cdef-0123-456789abcdef')
    ).toBe('01234567-89ab-cdef-0123-456789abcdef');
  });

  it('allows anonymous reads for public non-workspace plans', async () => {
    const plan = {
      id: 'plan-1',
      is_public: true,
      ws_id: null,
    };
    const mocks = createPlanClient({
      data: plan,
      error: null,
    });
    createAdminClientMock.mockResolvedValue(mocks.client);

    await expect(getPlan('plan-1', { actorUserId: null })).resolves.toBe(plan);

    expect(verifyWorkspaceMembershipTypeMock).not.toHaveBeenCalled();
  });

  it('rejects anonymous reads for public workspace plans', async () => {
    const mocks = createPlanClient({
      data: {
        id: 'plan-1',
        is_public: true,
        ws_id: 'ws-1',
      },
      error: null,
    });
    createAdminClientMock.mockResolvedValue(mocks.client);

    await expect(getPlan('plan-1', { actorUserId: null })).resolves.toBeNull();

    expect(verifyWorkspaceMembershipTypeMock).not.toHaveBeenCalled();
  });

  it('allows workspace members to read public workspace plans', async () => {
    const plan = {
      creator_id: 'creator-1',
      id: 'plan-1',
      is_public: true,
      ws_id: 'ws-1',
    };
    const mocks = createPlanClient({
      data: plan,
      error: null,
    });
    createAdminClientMock.mockResolvedValue(mocks.client);

    await expect(getPlan('plan-1', { actorUserId: 'member-1' })).resolves.toBe(
      plan
    );

    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith({
      requiredType: 'MEMBER',
      supabase: mocks.client,
      userId: 'member-1',
      wsId: 'ws-1',
    });
  });

  it('rejects private workspace plans for non-creator members', async () => {
    const mocks = createPlanClient({
      data: {
        creator_id: 'creator-1',
        id: 'plan-1',
        is_public: false,
        ws_id: 'ws-1',
      },
      error: null,
    });
    createAdminClientMock.mockResolvedValue(mocks.client);

    await expect(
      getPlan('plan-1', { actorUserId: 'member-1' })
    ).resolves.toBeNull();
  });

  it('allows private workspace plans for creator members', async () => {
    const plan = {
      creator_id: 'creator-1',
      id: 'plan-1',
      is_public: false,
      ws_id: 'ws-1',
    };
    const mocks = createPlanClient({
      data: plan,
      error: null,
    });
    createAdminClientMock.mockResolvedValue(mocks.client);

    await expect(getPlan('plan-1', { actorUserId: 'creator-1' })).resolves.toBe(
      plan
    );
  });

  it('falls back to the current Supabase user when no actor is provided', async () => {
    const plan = {
      creator_id: 'creator-1',
      id: 'plan-1',
      is_public: false,
      ws_id: null,
    };
    const mocks = createPlanClient({
      data: plan,
      error: null,
    });
    createAdminClientMock.mockResolvedValue(mocks.client);
    getUserMock.mockResolvedValue({
      data: { user: { id: 'creator-1' } },
    });

    await expect(getPlan('plan-1')).resolves.toBe(plan);
    expect(createClientMock).toHaveBeenCalled();
  });
});
