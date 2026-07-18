import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { FINANCE_INVOICE_ROUTE_POLICY } from './api-route-policies';

describe('Finance API route policies', () => {
  it('isolates invoice collection and detail CRUD', () => {
    const collection = new NextRequest(
      'https://finance.tuturuuu.com/api/v1/workspaces/ws-1/finance/invoices',
      { method: 'POST' }
    );
    const detail = new NextRequest(
      'https://finance.tuturuuu.com/api/v1/workspaces/ws-1/finance/invoices/invoice-1',
      { method: 'DELETE' }
    );

    expect(FINANCE_INVOICE_ROUTE_POLICY.matches(collection)).toBe(true);
    expect(FINANCE_INVOICE_ROUTE_POLICY.matches(detail)).toBe(true);
    expect(FINANCE_INVOICE_ROUTE_POLICY.rateLimits).toEqual({
      get: [],
      mutate: [
        { duration: '1 m', limit: 120, window: 'minute' },
        { duration: '1 h', limit: 1200, window: 'hour' },
        { duration: '1 d', limit: 10_000, window: 'day' },
      ],
    });
  });

  it('does not absorb unrelated Finance mutations', () => {
    const wallet = new NextRequest(
      'https://finance.tuturuuu.com/api/v1/workspaces/ws-1/wallets/wallet-1',
      { method: 'PATCH' }
    );
    const inventorySale = new NextRequest(
      'https://finance.tuturuuu.com/api/v1/workspaces/ws-1/inventory/sales',
      { method: 'POST' }
    );

    expect(FINANCE_INVOICE_ROUTE_POLICY.matches(wallet)).toBe(false);
    expect(FINANCE_INVOICE_ROUTE_POLICY.matches(inventorySale)).toBe(false);
  });
});
