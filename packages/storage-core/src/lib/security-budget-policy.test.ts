import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abort: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: async () => ({ rpc: mocks.rpc }),
}));

import {
  getSecurityBudgetPolicy,
  scaledSecurityBudgetLimit,
  securityBudgetPolicyFromEntitlement,
} from './security-budget-policy';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  mocks.rpc.mockReset().mockReturnValue({ abortSignal: mocks.abort });
  mocks.abort.mockReset().mockResolvedValue({
    data: { tier: 'PRO', paidWorkspaceCount: 1 },
    error: null,
  });
});
afterEach(() => vi.useRealTimers());
it('uses paid tiers and a bounded membership bonus, never duplicate unlimited uplift', () => {
  expect(
    securityBudgetPolicyFromEntitlement({ tier: 'FREE', paidWorkspaceCount: 0 })
      .multiplier
  ).toBe(1);
  expect(
    securityBudgetPolicyFromEntitlement({ tier: 'PLUS', paidWorkspaceCount: 1 })
      .multiplier
  ).toBe(4);
  expect(
    securityBudgetPolicyFromEntitlement({ tier: 'PRO', paidWorkspaceCount: 2 })
      .multiplier
  ).toBe(12.5);
  const enterprise = securityBudgetPolicyFromEntitlement({
    tier: 'ENTERPRISE',
    paidWorkspaceCount: 100,
  });
  expect(enterprise.multiplier).toBe(40);
  expect(scaledSecurityBudgetLimit(120, enterprise, 1000)).toBe(1000);
  for (const data of [
    null,
    { tier: 'toString', paidWorkspaceCount: 1 },
    { tier: 'FREE', paidWorkspaceCount: 1 },
    { tier: 'PRO', paidWorkspaceCount: -1 },
  ])
    expect(() => securityBudgetPolicyFromEntitlement(data)).toThrow();
});
it('coalesces authoritative lookups for 30 seconds and rechecks removed entitlements', async () => {
  const scope = { userId: '11111111-1111-4111-8111-111111111111' };
  await Promise.all([
    getSecurityBudgetPolicy(scope),
    getSecurityBudgetPolicy(scope),
  ]);
  expect(mocks.rpc).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(30_001);
  mocks.abort.mockResolvedValue({
    data: { tier: 'FREE', paidWorkspaceCount: 0 },
    error: null,
  });
  expect((await getSecurityBudgetPolicy(scope)).tier).toBe('FREE');
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it('does not cache failed lookups or trust arbitrary scope strings', async () => {
  const scope = { workspaceId: '22222222-2222-4222-8222-222222222222' };
  mocks.abort.mockResolvedValueOnce({
    data: null,
    error: { message: 'offline' },
  });
  await expect(getSecurityBudgetPolicy(scope)).rejects.toThrow();
  expect((await getSecurityBudgetPolicy(scope)).tier).toBe('PRO');
  mocks.rpc.mockClear();
  expect(
    (await getSecurityBudgetPolicy({ userId: 'claimed-paid-user' })).tier
  ).toBe('FREE');
  expect(mocks.rpc).not.toHaveBeenCalled();
});
