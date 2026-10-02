// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eval: vi.fn(),
  enabled: vi.fn(),
  policy: vi.fn(),
  identity: vi.fn(),
}));
vi.mock('@tuturuuu/storage-core/security-budget', () => ({
  reserveSecurityBudget: mocks.eval,
  isSecurityEgressEnforcementEnabled: mocks.enabled,
}));

vi.mock('./api-cost-identity', () => ({
  resolveApiCostIdentity: mocks.identity,
}));
vi.mock('@tuturuuu/storage-core/security-budget-policy', async (original) => ({
  ...(await original<
    typeof import('@tuturuuu/storage-core/security-budget-policy')
  >()),
  getSecurityBudgetPolicy: mocks.policy,
}));

vi.mock('server-only', () => ({}));

import { guardApiCost } from './api-cost-guard';

const request = (path: string, method = 'GET', ip = '192.0.2.1') =>
  new NextRequest(`https://example.test${path}`, {
    method,
    headers: { 'x-forwarded-for': ip },
  });
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  mocks.identity.mockReset().mockResolvedValue({});
  mocks.policy
    .mockReset()
    .mockResolvedValue({ tier: 'PRO', multiplier: 10, paidWorkspaceCount: 1 });
  mocks.enabled.mockReset().mockReturnValue(true);
  mocks.eval.mockReset().mockResolvedValue([1, 0]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('API cost guard', () => {
  it('shares caller CMS ceilings across files, query strings and external app paths', async () => {
    await guardApiCost(
      request('/api/v1/workspaces/ws-1/external-projects/assets/a?v=1')
    );
    const first = mocks.eval.mock.calls[0]![0];
    await guardApiCost(
      request('/api/v1/workspaces/ws-1/external-apps/cron-jobs', 'POST')
    );
    expect(mocks.eval.mock.calls[1]![0]).toEqual(first);
    expect(first).toHaveLength(4);
    expect(
      first.map((dimension: [string, number, number, number]) => dimension[2])
    ).toEqual([10000, 2000, 120, 60]);
  });
  it('bounds existing APIs globally and leaves OPTIONS available', async () => {
    await guardApiCost(request('/api/v1/storage/share', 'POST'));
    expect(mocks.eval.mock.calls[0]![0]).toHaveLength(3);
    mocks.eval.mockClear();
    expect(
      await guardApiCost(request('/api/v1/storage/share', 'OPTIONS'))
    ).toBeNull();
    expect(mocks.eval).not.toHaveBeenCalled();
  });
  it('fails closed on limiter outage, invalid responses and invalid limits', async () => {
    mocks.eval.mockRejectedValueOnce(new Error('private failure'));
    expect((await guardApiCost(request('/api/v1/anything')))?.status).toBe(503);
    mocks.eval.mockResolvedValueOnce(null);
    expect((await guardApiCost(request('/api/v1/anything')))?.status).toBe(503);
    vi.stubEnv('API_GLOBAL_REQUESTS_PER_MINUTE', '0');
    expect((await guardApiCost(request('/api/v1/anything')))?.status).toBe(503);
  });
  it('returns no-store 429 and a bounded retry delay', async () => {
    mocks.eval.mockResolvedValue([0, 1]);
    const response = await guardApiCost(request('/api/v1/anything'));
    expect(response?.status).toBe(429);
    expect(response?.headers.get('Cache-Control')).toContain('no-store');
    expect(Number(response?.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});

it('preserves existing APIs before migration activation without querying Postgres', async () => {
  mocks.enabled.mockReturnValue(false);
  expect(await guardApiCost(request('/api/v1/anything'))).toBeNull();
  expect(mocks.eval).not.toHaveBeenCalled();
});

it('canonicalizes encoded workspace IDs and separates authentication capacity', async () => {
  await guardApiCost(
    request('/api/v1/workspaces/ws-1/external-projects/assets/a')
  );
  const plain = mocks.eval.mock.calls[0]![0];
  await guardApiCost(
    request('/api/v1/workspaces/%77s-1/external-projects/assets/a')
  );
  expect(mocks.eval.mock.calls[1]![0]).toEqual(plain);
  await guardApiCost(request('/api/v1/auth/session'));
  expect(mocks.eval.mock.calls[2]![0][0][0]).not.toBe(plain[0][0]);
  expect(
    (
      await guardApiCost(
        request('/api/v1/workspaces/%zz/external-projects/assets/a')
      )
    )?.status
  ).toBe(400);
});

it('scales verified accounts by paid memberships without spending the free traffic pool', async () => {
  mocks.identity.mockResolvedValue({
    userId: '11111111-1111-4111-8111-111111111111',
  });
  mocks.policy.mockResolvedValue({
    tier: 'PRO',
    multiplier: 12.5,
    paidWorkspaceCount: 2,
  });
  await guardApiCost(request('/api/v1/anything'));
  const dimensions = mocks.eval.mock.calls.at(-1)![0];
  expect(dimensions).toHaveLength(2);
  expect(dimensions[1][2]).toBe(1500);
  expect(dimensions.map((d: [string]) => d[0]).join()).not.toContain(
    'free-family'
  );
});

it('does not read target entitlements after free/client pool exhaustion', async () => {
  mocks.eval.mockResolvedValue([0, 2]);
  expect(
    (
      await guardApiCost(
        request(
          '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/external-projects/assets/a'
        )
      )
    )?.status
  ).toBe(429);
  expect(mocks.policy).not.toHaveBeenCalled();
});

it('scales machine APIs only from a verified API-key workspace, with a shared key subject', async () => {
  mocks.identity.mockResolvedValue({
    workspaceId: '11111111-1111-4111-8111-111111111111',
    keyId: 'key-1',
  });
  await guardApiCost(request('/api/v1/storage/share', 'POST'));
  expect(mocks.eval.mock.calls[0]![0]).toHaveLength(3);
  expect(mocks.eval.mock.calls[0]![0][1][2]).toBe(1200);
  expect(mocks.policy).toHaveBeenCalledWith({
    workspaceId: '11111111-1111-4111-8111-111111111111',
  });
});

it('never looks up or charges a victim workspace from an untrusted URL', async () => {
  const path =
    '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/external-projects/assets/a';
  await guardApiCost(request(path, 'GET', '192.0.2.1'));
  await guardApiCost(request(path, 'GET', '192.0.2.2'));
  expect(mocks.policy).not.toHaveBeenCalled();
  const first = mocks.eval.mock.calls[0]![0];
  const second = mocks.eval.mock.calls[1]![0];
  expect(first[0]).toEqual(second[0]);
  expect(first[1]).toEqual(second[1]);
  expect(first[3][0]).not.toEqual(second[3][0]);
});

it('uses one atomic reservation even when the caller-workspace dimension rejects', async () => {
  mocks.eval.mockResolvedValue([0, 4]);
  const response = await guardApiCost(
    request('/api/workspaces/ws-1/external-projects/assets/a')
  );
  expect(response?.status).toBe(429);
  expect(mocks.eval).toHaveBeenCalledOnce();
  expect(mocks.eval.mock.calls[0]![0]).toHaveLength(4);
});

it('shares caller-workspace limits between versioned and non-versioned paths', async () => {
  await guardApiCost(
    request('/api/workspaces/ws-1/external-projects/assets/a')
  );
  await guardApiCost(
    request('/api/v1/workspaces/ws-1/external-projects/assets/a')
  );
  expect(mocks.eval.mock.calls[0]![0]).toEqual(mocks.eval.mock.calls[1]![0]);
});
