import { describe, expect, it, vi } from 'vitest';
import { createInventoryPrice, listInventoryPrices } from './inventory-prices';
describe('inventory price client', () => {
  it('reads uncached prices on the canonical workspace/period path', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [], as_of: '2026-10-03T12:00:00Z' })
        )
      );
    await listInventoryPrices('ws', 'period', {
      baseUrl: 'https://inventory.example.test',
      fetch,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://inventory.example.test/api/v1/workspaces/ws/inventory/sales-periods/period/prices',
      expect.objectContaining({ cache: 'no-store' })
    );
  });
  it('forwards authorized headers and exact major-unit prices', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: {} })));
    const payload = {
      product_id: 'p',
      unit_id: 'u',
      warehouse_id: 'w',
      price: 60000,
      starts_on: '2026-10-03',
    };
    await createInventoryPrice('ws', 'period', payload, {
      baseUrl: 'https://inventory.example.test',
      fetch,
      defaultHeaders: { Authorization: 'Bearer synthetic-fixture' },
    });
    const request = fetch.mock.calls[0]![1];
    expect(request.method).toBe('POST');
    expect(new Headers(request.headers).get('Authorization')).toBe(
      'Bearer synthetic-fixture'
    );
    expect(JSON.parse(request.body)).toEqual(payload);
  });
});
