import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeAbuseIntelligenceRequest: vi.fn(),
  recordAbuseActivitySignal: vi.fn(),
  serverLoggerError: vi.fn(),
  unblockIP: vi.fn(),
}));

vi.mock('../../abuse-intelligence/_shared', () => ({
  authorizeAbuseIntelligenceRequest: (...args: unknown[]) =>
    mocks.authorizeAbuseIntelligenceRequest(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  recordAbuseActivitySignal: (...args: unknown[]) =>
    mocks.recordAbuseActivitySignal(...args),
  unblockIP: (...args: unknown[]) => mocks.unblockIP(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
  },
}));

import { PATCH } from './route';

function makePatchRequest(body: unknown) {
  return new Request(
    'http://localhost/api/v1/infrastructure/rate-limit-appeals/42529372-c669-4833-bb32-2cab1f4ffd83',
    {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    }
  );
}

type MockQueryBuilder = {
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  is: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function createBuilder(finalData: unknown) {
  const builder = {} as MockQueryBuilder;
  Object.assign(builder, {
    eq: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    in: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    is: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data: finalData, error: null }),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue({ data: finalData, error: null }),
    update: vi.fn(() => builder),
  });
  Object.defineProperty(builder, 'then', {
    value: vi.fn((resolve: (value: unknown) => unknown) =>
      resolve({
        data:
          finalData == null || Array.isArray(finalData)
            ? finalData
            : [finalData],
        error: null,
      })
    ),
  });
  return builder;
}

describe('rate-limit appeal admin action route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unblockIP.mockResolvedValue(true);
  });

  it('approves an appeal, clears the IP block, and creates a trusted workspace rule', async () => {
    const appeal = {
      client_ip: '203.0.113.10',
      creator_id: 'user-1',
      id: '42529372-c669-4833-bb32-2cab1f4ffd83',
      status: 'pending',
      workspace_id: 'e9e2073c-7072-4e86-a268-b6e48f541fd5',
    };
    const loadAppealBuilder = createBuilder(appeal);
    const workspaceLookupBuilder = createBuilder({
      avatar_url: null,
      handle: 'classroom',
      id: 'e9e2073c-7072-4e86-a268-b6e48f541fd5',
      name: 'Classroom Workspace',
      personal: false,
    });
    const membershipLookupBuilder = createBuilder({
      type: 'MEMBER',
      user_id: 'user-1',
      ws_id: 'e9e2073c-7072-4e86-a268-b6e48f541fd5',
    });
    const blockedIpBuilder = createBuilder({ id: 'blocked-ip-1' });
    const ruleBuilder = createBuilder({
      id: 'rule-1',
      subject_key: 'workspace:e9e2073c-7072-4e86-a268-b6e48f541fd5',
    });
    const updateAppealBuilder = createBuilder({
      ...appeal,
      created_rate_limit_rule_id: 'rule-1',
      status: 'approved',
    });
    const from = vi
      .fn()
      .mockImplementationOnce(() => loadAppealBuilder)
      .mockImplementationOnce(() => workspaceLookupBuilder)
      .mockImplementationOnce(() => membershipLookupBuilder)
      .mockImplementationOnce(() => blockedIpBuilder)
      .mockImplementationOnce(() => ruleBuilder)
      .mockImplementationOnce(() => updateAppealBuilder)
      .mockImplementation(() => createBuilder(null));

    mocks.authorizeAbuseIntelligenceRequest.mockResolvedValue({
      ok: true,
      sbAdmin: { from },
      user: { id: 'admin-1' },
    });

    const response = await PATCH(
      makePatchRequest({
        action: 'approve',
        expiresInDays: 30,
        presetKey: 'trusted_workspace',
        reviewNote: 'Confirmed classroom traffic',
        trustMultiplier: 3,
      }),
      {
        params: Promise.resolve({
          appealId: '42529372-c669-4833-bb32-2cab1f4ffd83',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.unblockIP).toHaveBeenCalledWith(
      '203.0.113.10',
      'admin-1',
      'Confirmed classroom traffic'
    );
    expect(ruleBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        limit_mode: 'inherit_multiplier',
        subject_key: 'workspace:e9e2073c-7072-4e86-a268-b6e48f541fd5',
        subject_type: 'workspace',
        tier: 'trusted',
        trust_multiplier: 3,
      })
    );
    expect(ruleBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          preset_key: 'trusted_workspace',
          workspace_membership_verified: true,
        }),
      })
    );
    expect(updateAppealBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        cleared_blocked_ip_id: 'blocked-ip-1',
        created_rate_limit_rule_id: 'rule-1',
        status: 'approved',
      })
    );
  });

  it('rejects an appeal without unblocking or creating a rule', async () => {
    const appeal = {
      client_ip: '203.0.113.10',
      creator_id: 'user-1',
      id: '42529372-c669-4833-bb32-2cab1f4ffd83',
      status: 'pending',
      workspace_id: null,
    };
    const loadAppealBuilder = createBuilder(appeal);
    const updateAppealBuilder = createBuilder({
      ...appeal,
      status: 'rejected',
    });
    const from = vi
      .fn()
      .mockImplementationOnce(() => loadAppealBuilder)
      .mockImplementationOnce(() => updateAppealBuilder);

    mocks.authorizeAbuseIntelligenceRequest.mockResolvedValue({
      ok: true,
      sbAdmin: { from },
      user: { id: 'admin-1' },
    });

    const response = await PATCH(
      makePatchRequest({
        action: 'reject',
        reviewNote: 'Still abusive',
      }),
      {
        params: Promise.resolve({
          appealId: '42529372-c669-4833-bb32-2cab1f4ffd83',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.unblockIP).not.toHaveBeenCalled();
    expect(updateAppealBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        review_note: 'Still abusive',
        status: 'rejected',
      })
    );
  });

  it('rejects workspace uplift when the requester is not a workspace member', async () => {
    const appeal = {
      client_ip: '203.0.113.10',
      creator_id: 'user-1',
      id: '42529372-c669-4833-bb32-2cab1f4ffd83',
      status: 'pending',
      workspace_id: 'e9e2073c-7072-4e86-a268-b6e48f541fd5',
    };
    const loadAppealBuilder = createBuilder(appeal);
    const workspaceLookupBuilder = createBuilder({
      avatar_url: null,
      handle: 'classroom',
      id: 'e9e2073c-7072-4e86-a268-b6e48f541fd5',
      name: 'Classroom Workspace',
      personal: false,
    });
    const membershipLookupBuilder = createBuilder(null);
    const from = vi
      .fn()
      .mockImplementationOnce(() => loadAppealBuilder)
      .mockImplementationOnce(() => workspaceLookupBuilder)
      .mockImplementationOnce(() => membershipLookupBuilder);

    mocks.authorizeAbuseIntelligenceRequest.mockResolvedValue({
      ok: true,
      sbAdmin: { from },
      user: { id: 'admin-1' },
    });

    const response = await PATCH(
      makePatchRequest({
        action: 'approve',
        presetKey: 'trusted_workspace',
      }),
      {
        params: Promise.resolve({
          appealId: '42529372-c669-4833-bb32-2cab1f4ffd83',
        }),
      }
    );

    expect(response.status).toBe(409);
    expect(mocks.unblockIP).not.toHaveBeenCalled();
  });
});
