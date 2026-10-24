// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  key: vi.fn(),
  ip: vi.fn(),
  blocked: vi.fn(),
  rate: vi.fn(),
  policy: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock('@tuturuuu/auth/api-keys', () => ({
  validateApiKey: mocks.key,
  logApiKeyUsage: vi.fn(),
  hasAllPermissions: () => true,
  hasAnyPermission: () => true,
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: mocks.ip,
  isIPBlocked: mocks.blocked,
}));
vi.mock('@tuturuuu/storage-core/security-budget', () => ({
  isSecurityEgressEnforcementEnabled: mocks.enabled,
}));
vi.mock('@tuturuuu/storage-core/security-budget-policy', async (original) => ({
  ...(await original<
    typeof import('@tuturuuu/storage-core/security-budget-policy')
  >()),
  getSecurityBudgetPolicy: mocks.policy,
}));
vi.mock('./rate-limit', () => ({
  checkRateLimit: mocks.rate,
  RATE_LIMIT_SECRET_NAMES: {},
}));
vi.mock('./abuse-risk', () => ({
  resolveWebAbuseDecision: async () => ({ trustMultiplier: 0.5 }),
  getAdaptiveRateLimitConfig: (config: unknown) => ({ config }),
  recordResponseAbuseSignal: vi.fn(),
}));

import { withApiAuth } from './api-middleware';

const handler = vi.fn(async () => NextResponse.json({ ok: true }));
const request = () =>
  new NextRequest('https://example.test/api/v1/storage/download/file', {
    headers: { authorization: 'Bearer ttr_test_only', 'x-plan': 'ENTERPRISE' },
  });
beforeEach(() => {
  mocks.ip.mockReset().mockReturnValue('192.0.2.1');
  mocks.blocked.mockReset().mockResolvedValue(null);
  mocks.enabled.mockReset().mockReturnValue(true);
  mocks.key.mockReset().mockResolvedValue({
    wsId: 'workspace-verified',
    keyId: 'key-1',
    permissions: ['manage_drive'],
  });
  mocks.policy.mockReset().mockResolvedValue({
    tier: 'PRO',
    multiplier: 12.5,
    paidWorkspaceCount: 2,
  });
  mocks.rate.mockReset().mockResolvedValue({ allowed: true, headers: {} });
  handler.mockClear();
});
it('scales only from the authenticated key workspace before existing risk handling', async () => {
  const route = withApiAuth(handler, {
    permissions: ['manage_drive'],
    rateLimit: { windowMs: 60000, maxRequests: 50 },
  });
  expect((await route(request())).status).toBe(200);
  expect(mocks.rate).toHaveBeenCalledWith('ip:read:192.0.2.1', {
    windowMs: 60000,
    maxRequests: 50,
  });
  expect(mocks.policy).toHaveBeenCalledWith({
    workspaceId: 'workspace-verified',
  });
  expect(mocks.rate).toHaveBeenCalledWith(
    'key-1:read',
    expect.objectContaining({ maxRequests: 625 }),
    'workspace-verified'
  );
});
it('does not look up entitlements or invoke a handler for invalid keys', async () => {
  mocks.key.mockResolvedValue(null);
  expect(
    (
      await withApiAuth(handler, {
        rateLimit: { windowMs: 60000, maxRequests: 50 },
      })(request())
    ).status
  ).toBe(401);
  expect(mocks.policy).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});
it('denies safely on entitlement outage and preserves existing limits before activation', async () => {
  const route = withApiAuth(handler, {
    rateLimit: { windowMs: 60000, maxRequests: 50 },
  });
  mocks.policy.mockRejectedValue(new Error('unavailable'));
  expect((await route(request())).status).toBe(503);
  expect(handler).not.toHaveBeenCalled();
  mocks.enabled.mockReturnValue(false);
  expect((await route(request())).status).toBe(200);
  expect(mocks.rate).toHaveBeenLastCalledWith(
    'key-1:read',
    expect.objectContaining({ maxRequests: 50 }),
    'workspace-verified'
  );
});

it('rate-limits the shared unknown IP bucket before validating an API key', async () => {
  mocks.ip.mockReturnValue('unknown');
  mocks.rate.mockResolvedValue(
    NextResponse.json({ error: 'Too Many Requests' }, { status: 429 })
  );
  const response = await withApiAuth(handler, {
    rateLimit: { windowMs: 60000, maxRequests: 50 },
  })(request());
  expect(response.status).toBe(429);
  expect(mocks.rate).toHaveBeenCalledWith('ip:read:unknown', {
    windowMs: 60000,
    maxRequests: 50,
  });
  expect(mocks.key).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});
it('rejects a persistently blocked unknown IP bucket before authentication', async () => {
  mocks.ip.mockReturnValue('unknown');
  mocks.blocked.mockResolvedValue({ expiresAt: new Date(Date.now() + 60000) });
  const response = await withApiAuth(handler)(request());
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ code: 'IP_BLOCKED' });
  expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
  expect(mocks.blocked).toHaveBeenCalledWith('unknown', {
    route: '/api/v1/storage/download/file',
    source: 'api-middleware',
  });
  expect(mocks.key).not.toHaveBeenCalled();
  expect(mocks.rate).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});
