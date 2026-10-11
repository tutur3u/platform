import { expect, it, vi } from 'vitest';
import { listPeriodicReports } from './reports';

it('transports the complete report scope including all periodic cadences and category', async () => {
  const response = {
    total: 1125,
    categoryCounts: { infrastructure: 1125 },
    data: [],
  };
  const request = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify(response))
  );
  const result = await listPeriodicReports(
    'workspace',
    {
      cadence: 'all',
      category: 'infrastructure',
      stage: 'blocked',
      query: 'matching',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      approvalStatus: 'APPROVED',
      generationStatus: 'ready',
      deliveryStatus: 'blocked',
      page: 2,
      pageSize: 20,
    },
    { baseUrl: 'https://example.test', fetch: request }
  );
  const url = new URL(String(request.mock.calls[0]?.[0]));
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    cadence: 'all',
    category: 'infrastructure',
    stage: 'blocked',
    q: 'matching',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    approvalStatus: 'APPROVED',
    generationStatus: 'ready',
    deliveryStatus: 'blocked',
    page: '2',
    pageSize: '20',
  });
  expect(result).toEqual(response);
});
