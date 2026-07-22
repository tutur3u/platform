import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import {
  getInventorySaleDisplayTitle,
  getInventorySaleShortReference,
} from './sale-display';

const labels = {
  inventory: 'Inventory sale',
  online: 'Online checkout',
  square: 'Square POS sale',
  storefront: 'Storefront sale',
};

function sale(
  overrides: Partial<InventorySaleSummary> = {}
): InventorySaleSummary {
  return {
    completed_at: '2026-07-21T12:00:00Z',
    created_at: '2026-07-21T12:00:00Z',
    currency: 'USD',
    customer_name: null,
    id: 'ce1789b1-ea44-4b60-82a4-e32846f69d2a',
    items_count: 1,
    owners: [],
    paid_amount: 2000,
    source: 'checkout_session',
    total_quantity: 1,
    ...overrides,
  };
}

describe('inventory sale display', () => {
  it('uses provider-aware labels instead of opaque checkout references', () => {
    expect(
      getInventorySaleDisplayTitle(
        sale({
          notice: 'ce1789b1ea444b6082a4e32846f69d2a',
          square_order_id: 'square-order',
        }),
        labels
      )
    ).toBe('Square POS sale');
    expect(
      getInventorySaleDisplayTitle(
        sale({ polar_order_id: 'polar-order' }),
        labels
      )
    ).toBe('Online checkout');
    expect(getInventorySaleDisplayTitle(sale(), labels)).toBe(
      'Storefront sale'
    );
  });

  it('keeps descriptive manual titles and rejects opaque invoice notices', () => {
    expect(
      getInventorySaleDisplayTitle(
        sale({ notice: 'Convention booth sale', source: 'finance_invoice' }),
        labels
      )
    ).toBe('Convention booth sale');
    expect(
      getInventorySaleDisplayTitle(
        sale({
          customer_name: 'Albert Chu',
          notice: 'ce1789b1ea444b6082a4e32846f69d2a',
          source: 'finance_invoice',
        }),
        labels
      )
    ).toBe('Albert Chu');
  });

  it('uses a compact stable reference in dense sales rows', () => {
    expect(
      getInventorySaleShortReference(
        sale({ public_token: 'ce1789b1ea444b6082a4e32846f69d2a' })
      )
    ).toBe('CE1789B1');
  });
});
