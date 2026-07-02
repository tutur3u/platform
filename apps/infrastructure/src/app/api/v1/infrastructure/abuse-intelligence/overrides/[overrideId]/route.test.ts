import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  authorize: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  recordSignal: vi.fn(),
  select: vi.fn(),
  serverLoggerError: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  recordAbuseActivitySignal: (input: unknown) => mocks.recordSignal(input),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
  },
}));

vi.mock('../../_shared', () => ({
  authorizeAbuseIntelligenceRequest: (...args: unknown[]) =>
    mocks.authorize(...args),
}));

import { PATCH } from './route';

describe('abuse intelligence override route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        id: 'override-1',
        subject_key: 'user:user-1',
        subject_type: 'user',
      },
      error: null,
    });
  });

  it('requires override management permission', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/infrastructure/abuse-intelligence/overrides/override-1',
        {
          body: JSON.stringify({ reason: 'Expired manual verification' }),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({ overrideId: 'override-1' }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(
      expect.any(Request),
      'manage_workspace_roles'
    );
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('revokes manual overrides through the server-owned client', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: {
        from: mocks.adminFrom,
      },
      supabase: {
        from: vi.fn(),
      },
      user: {
        id: 'admin-1',
      },
    });

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/infrastructure/abuse-intelligence/overrides/override-1',
        {
          body: JSON.stringify({ reason: 'Expired manual verification' }),
          method: 'PATCH',
        }
      ),
      {
        params: Promise.resolve({ overrideId: 'override-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminFrom).toHaveBeenCalledWith('abuse_trust_overrides');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        revoke_reason: 'Expired manual verification',
        revoked_at: expect.any(String),
        revoked_by: 'admin-1',
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('id', 'override-1');
    expect(mocks.is).toHaveBeenCalledWith('revoked_at', null);
    expect(mocks.recordSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          overrideId: 'override-1',
          revoked: true,
        }),
        reasonCode: 'manual_override_revoked',
        userId: 'admin-1',
      })
    );
  });
});
