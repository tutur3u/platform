import { describe, expect, it, vi } from 'vitest';
import { deleteInvoice } from './finance';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('finance internal API helpers', () => {
  it('deletes invoices through the centralized workspace finance API', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'success' }));

    await deleteInvoice('workspace 1', 'invoice/1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/finance/invoices/invoice%2F1',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});
