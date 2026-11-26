import { beforeEach, expect, it, vi } from 'vitest';
import { resolveAbuseRiskDecision } from '../reputation';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), rpc: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));

const request = {
  authKind: 'temp',
  headers: new Headers({
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  }),
  isRead: false,
  method: 'POST',
  route: '/meet/guest',
  ipAddress: '203.0.113.4',
} as const;

beforeEach(() => {
  mocks.admin.mockReset().mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockReset();
});

it.each([
  { data: null, error: new Error('RPC unavailable') },
  { data: [], error: null },
  { data: [{ tier: 'invalid' }], error: null },
])('requires an authoritative row for event decisions', async (reply) => {
  mocks.rpc.mockResolvedValue(reply);
  await expect(
    resolveAbuseRiskDecision({ ...request, requireServerDecision: true })
  ).rejects.toThrow();
});

it('fails closed on admin initialization errors and preserves ordinary fallback', async () => {
  mocks.admin.mockRejectedValue(new Error('Admin unavailable'));
  await expect(
    resolveAbuseRiskDecision({ ...request, requireServerDecision: true })
  ).rejects.toThrow();
  await expect(resolveAbuseRiskDecision(request)).resolves.toMatchObject({
    tier: 'standard',
  });
});

it('accepts an explicit standard decision and refuses a blocked override', async () => {
  const row = {
    tier: 'standard',
    decision_source: 'default',
    trust_multiplier: 1,
    subject_key: null,
    limit_mode: 'inherit_multiplier',
  };
  mocks.rpc.mockResolvedValueOnce({ data: [row], error: null });
  await expect(
    resolveAbuseRiskDecision({ ...request, requireServerDecision: true })
  ).resolves.toMatchObject({ tier: 'standard' });
  mocks.rpc.mockResolvedValueOnce({
    data: [{ ...row, decision_source: 'override', limit_mode: 'blocked' }],
    error: null,
  });
  await expect(
    resolveAbuseRiskDecision({ ...request, requireServerDecision: true })
  ).resolves.toMatchObject({ tier: 'restricted' });
});
