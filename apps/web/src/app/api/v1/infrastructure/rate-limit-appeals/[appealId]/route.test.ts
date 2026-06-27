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

function createBuilder(finalData: unknown) {
  const builder = {
    eq: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    is: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data: finalData, error: null }),
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue({ data: finalData, error: null }),
    update: vi.fn(() => builder),
  };
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
      .mockImplementationOnce(() => blockedIpBuilder)
      .mockImplementationOnce(() => ruleBuilder)
      .mockImplementationOnce(() => updateAppealBuilder);

    mocks.authorizeAbuseIntelligenceRequest.mockResolvedValue({
      ok: true,
      sbAdmin: { from },
      user: { id: 'admin-1' },
    });

    const response = await PATCH(
      makePatchRequest({
        action: 'approve',
        expiresInDays: 30,
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
});
