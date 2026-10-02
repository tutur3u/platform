import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ eval: vi.fn() }));
vi.mock('@tuturuuu/storage-core/security-budget', () => ({
  reserveSecurityBudget: mocks.eval,
}));

import { guardApiCost } from './api-cost-guard';

const request = (path: string, method = 'GET') =>
  new NextRequest(`https://example.test${path}`, { method });
beforeEach(() => {
  vi.unstubAllEnvs();
  mocks.eval.mockReset().mockResolvedValue([1, 0]);
});
describe('API cost guard', () => {
  it('shares CMS ceilings across files, query strings, credentials and external app paths', async () => {
    await guardApiCost(
      request('/api/v1/workspaces/ws-1/external-projects/assets/a?v=1')
    );
    const first = mocks.eval.mock.calls[0]![0];
    await guardApiCost(
      request('/api/v1/workspaces/ws-1/external-apps/cron-jobs', 'POST')
    );
    expect(mocks.eval.mock.calls[1]![0]).toEqual(first);
    expect(first).toHaveLength(2);
    expect(
      first.map((dimension: [string, number, number, number]) => dimension[2])
    ).toEqual([10000, 600]);
  });
  it('bounds existing APIs globally and leaves OPTIONS available', async () => {
    await guardApiCost(request('/api/v1/storage/share', 'POST'));
    expect(mocks.eval.mock.calls[0]![0]).toHaveLength(1);
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
