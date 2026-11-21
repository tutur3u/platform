import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  enrichRateLimitRules: vi.fn(),
  readEdgeAbuseProtectionControls: vi.fn(),
  readEdgeTrustState: vi.fn(),
  recordAbuseActivitySignal: vi.fn(),
  serverLoggerError: vi.fn(),
  writeEdgeAbuseProtectionControls: vi.fn(),
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  ABUSE_REPUTATION_SUBJECT_TYPES: [
    'api_key',
    'cidr',
    'ip',
    'session',
    'user',
    'user_location',
    'workspace',
  ],
  ABUSE_RISK_TIERS: [
    'trusted',
    'standard',
    'watch',
    'challenge_required',
    'restricted',
  ],
  RATE_LIMIT_MODES: ['inherit_multiplier', 'absolute', 'unlimited', 'blocked'],
  recordAbuseActivitySignal: (...args: unknown[]) =>
    mocks.recordAbuseActivitySignal(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection/edge', () => ({
  readEdgeAbuseProtectionControls: (...args: unknown[]) =>
    mocks.readEdgeAbuseProtectionControls(...args),
  writeEdgeAbuseProtectionControls: (...args: unknown[]) =>
    mocks.writeEdgeAbuseProtectionControls(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: unknown[]) => mocks.serverLoggerError(...args),
  },
}));

vi.mock('@/lib/infrastructure/rate-limit-redis-admin', () => ({
  readEdgeTrustState: (...args: unknown[]) => mocks.readEdgeTrustState(...args),
}));

vi.mock('@/lib/rate-limits/subject-resolution', () => ({
  enrichRateLimitRules: (...args: unknown[]) =>
    mocks.enrichRateLimitRules(...args),
}));

vi.mock('../abuse-intelligence/_shared', () => ({
  authorizeAbuseIntelligenceRequest: (...args: unknown[]) =>
    mocks.authorize(...args),
  defaultTrustMultiplierForTier: vi.fn(() => 1),
}));

import { PATCH } from './route';

function makePatchRequest(body: unknown) {
  return new Request('http://localhost/api/v1/infrastructure/rate-limits', {
    body: JSON.stringify(body),
    method: 'PATCH',
  });
}

describe('rate-limits route PATCH', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: {
        from: vi.fn(),
      },
      user: {
        id: 'admin-1',
      },
    });
    mocks.writeEdgeAbuseProtectionControls.mockResolvedValue({
      ipBlockingEnabled: false,
      rateLimitsEnabled: true,
      updatedAt: '2026-07-01T00:00:00.000Z',
      updatedBy: 'admin-1',
    });
  });

  it('requires manage access before updating protection controls', async () => {
    const deniedResponse = new Response(
      JSON.stringify({ message: 'Forbidden' }),
      {
        status: 403,
      }
    );
    mocks.authorize.mockResolvedValueOnce({
      ok: false,
      response: deniedResponse,
    });

    const request = makePatchRequest({ ipBlockingEnabled: false });
    const response = await PATCH(request);

    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(
      request,
      'manage_workspace_roles'
    );
    expect(mocks.writeEdgeAbuseProtectionControls).not.toHaveBeenCalled();
  });

  it('rejects empty protection control patches', async () => {
    const response = await PATCH(makePatchRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invalid request data',
    });
    expect(mocks.writeEdgeAbuseProtectionControls).not.toHaveBeenCalled();
  });

  it('writes the requested controls with the operator user id', async () => {
    const response = await PATCH(
      makePatchRequest({
        ipBlockingEnabled: false,
        rateLimitsEnabled: true,
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.writeEdgeAbuseProtectionControls).toHaveBeenCalledWith({
      ipBlockingEnabled: false,
      rateLimitsEnabled: true,
      updatedBy: 'admin-1',
    });
    await expect(response.json()).resolves.toMatchObject({
      abuseProtectionControls: {
        ipBlockingEnabled: false,
        rateLimitsEnabled: true,
        updatedBy: 'admin-1',
      },
      message: 'Updated abuse protection controls.',
    });
  });

  it('returns a safe server error when the controls store cannot be updated', async () => {
    mocks.writeEdgeAbuseProtectionControls.mockRejectedValueOnce(
      new Error('redis unavailable')
    );

    const response = await PATCH(
      makePatchRequest({ rateLimitsEnabled: false })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Failed to update abuse protection controls',
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
