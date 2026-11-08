import { describe, expect, it, vi } from 'vitest';
import {
  createInventorySalesPeriod,
  updateInventorySalesDefaults,
} from './inventory';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('inventory sales default client', () => {
  it('sends only the auto-default field when the other defaults are omitted', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'success' }));
    const payload = { autoSetNewSalesPeriodAsDefault: false };

    await updateInventorySalesDefaults('workspace 1', payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/inventory/sales-defaults',
      expect.objectContaining({
        body: JSON.stringify(payload),
        method: 'PUT',
      })
    );
  });

  it('returns the created period and the saved-policy outcome', async () => {
    const body = {
      data: { id: 'period-2', ws_id: 'workspace 1' },
      salesDefault: { status: 'failed' as const },
    };
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse(body));
    const payload = { name: 'Spring', product_scope: 'all' as const };

    const result = await createInventorySalesPeriod('workspace 1', payload, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result).toEqual(body);
    const init = fetchMock.mock.calls[0]?.[1] as { body?: string };
    expect(JSON.parse(init.body ?? '')).toEqual(payload);
    expect(JSON.parse(init.body ?? '')).not.toHaveProperty(
      'autoSetNewSalesPeriodAsDefault'
    );
  });
});
