import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), abort: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import { reserveSecurityBudget } from './security-budget';

beforeEach(() => {
  mocks.rpc.mockReset().mockReturnValue({ abortSignal: mocks.abort });
  mocks.abort.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it('reserves through the existing database without Redis', async () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
  mocks.abort.mockResolvedValue({ data: [1, 0], error: null });
  await expect(
    reserveSecurityBudget([['api-cost:v1:global:1', 1, 100, 120]])
  ).resolves.toEqual([1, 0]);
  expect(mocks.rpc).toHaveBeenCalledWith('reserve_security_budget', {
    p_dimensions: [
      { key: 'api-cost:v1:global:1', amount: 1, maximum: 100, ttl: 120 },
    ],
  });
});
it('rejects unavailable RPCs and malformed responses instead of falling back', async () => {
  for (const response of [
    { data: null, error: { message: 'unavailable' } },
    { data: [1], error: null },
    { data: [2, 0], error: null },
  ]) {
    mocks.abort.mockResolvedValue(response);
    await expect(
      reserveSecurityBudget([['api-cost:v1:global:1', 1, 100, 120]])
    ).rejects.toThrow('Shared security budget unavailable');
  }
});
