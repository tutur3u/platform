import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  authorize: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  select: vi.fn(),
  serverLoggerError: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  ABUSE_RISK_TIERS: [
    'trusted',
    'standard',
    'watch',
    'challenge_required',
    'restricted',
  ],
  RATE_LIMIT_MODES: ['inherit_multiplier', 'absolute', 'unlimited', 'blocked'],
  recordAbuseActivitySignal: vi.fn(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
  },
}));

vi.mock('../../../abuse-intelligence/_shared', () => ({
  authorizeAbuseIntelligenceRequest: (...args: unknown[]) =>
    mocks.authorize(...args),
}));

import { PATCH } from './route';

function makePatchRequest(body: unknown) {
  return new Request(
    'http://localhost/api/v1/infrastructure/rate-limits/rules/rule-1',
    {
      body: JSON.stringify(body),
      method: 'PATCH',
    }
  );
}

function makeRouteContext() {
  return {
    params: Promise.resolve({ ruleId: 'rule-1' }),
  };
}

describe('rate-limit rule route PATCH', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: {
        from: mocks.adminFrom,
      },
      user: {
        id: 'admin-1',
      },
    });

    mocks.adminFrom.mockReturnValue({
      update: mocks.update,
    });
    mocks.update.mockReturnValue({
      eq: mocks.eq,
    });
    mocks.eq.mockReturnValue({
      is: mocks.is,
    });
    mocks.is.mockReturnValue({
      select: mocks.select,
    });
    mocks.select.mockReturnValue({
      single: mocks.single,
    });
    mocks.single.mockResolvedValue({
      data: {
        absolute_limits: null,
        id: 'rule-1',
        limit_mode: 'inherit_multiplier',
      },
      error: null,
    });
  });

  it('rejects absolute mode updates without concrete absolute limits', async () => {
    const response = await PATCH(
      makePatchRequest({ limitMode: 'absolute' }),
      makeRouteContext()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invalid request data',
    });
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('rejects empty absolute limit objects', async () => {
    const response = await PATCH(
      makePatchRequest({ absoluteLimits: { read: {}, write: {} } }),
      makeRouteContext()
    );

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects absolute limits on non-absolute modes', async () => {
    const response = await PATCH(
      makePatchRequest({
        absoluteLimits: { write: { minute: 100 } },
        limitMode: 'unlimited',
      }),
      makeRouteContext()
    );

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('accepts absolute mode with a concrete window limit', async () => {
    const absoluteLimits = { read: { minute: 300 } };

    const response = await PATCH(
      makePatchRequest({
        absoluteLimits,
        limitMode: 'absolute',
      }),
      makeRouteContext()
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        absolute_limits: absoluteLimits,
        limit_mode: 'absolute',
      })
    );
  });

  it('clears stale absolute limits when switching away from absolute mode', async () => {
    const response = await PATCH(
      makePatchRequest({ limitMode: 'inherit_multiplier' }),
      makeRouteContext()
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        absolute_limits: null,
        limit_mode: 'inherit_multiplier',
      })
    );
  });
});
