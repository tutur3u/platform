import { describe, expect, it, vi } from 'vitest';
import { getInvoiceHistory, restoreInvoice } from './finance';

describe('invoice history client', () => {
  it('encodes workspace and search while disabling caching', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), { status: 200 })
      );
    await getInvoiceHistory(
      'workspace/one',
      { q: 'Customer & family', deletedOnly: true, offset: 25, limit: 25 },
      { baseUrl: 'https://finance.example', fetch }
    );
    const url = new URL(fetch.mock.calls[0]?.[0]);
    expect(url.pathname).toBe(
      '/api/v1/workspaces/workspace%2Fone/finance/invoices/history'
    );
    expect(url.searchParams.get('q')).toBe('Customer & family');
    expect(url.searchParams.get('deletedOnly')).toBe('true');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
  });
  it('restores through the invoice-scoped POST endpoint', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'success' }), { status: 200 })
      );
    await restoreInvoice('workspace', 'invoice/one', {
      baseUrl: 'https://finance.example',
      fetch,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://finance.example/api/v1/workspaces/workspace/finance/invoices/invoice%2Fone/restore',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
