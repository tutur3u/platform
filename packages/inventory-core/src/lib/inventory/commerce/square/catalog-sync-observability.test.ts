import { describe, expect, it } from 'vitest';
import { mapSquareCatalogLinkObservability } from './catalog-sync-observability';

const baseLink = {
  last_error: null,
  last_synced_at: '2026-07-13T10:00:00.000Z',
  product_id: 'product-1',
  square_item_id: 'square-item-1',
  square_item_name: 'Square poster',
  square_sku: 'POSTER-1',
  square_variation_id: 'square-variation-1',
  square_variation_name: 'Default',
  status: 'active' as const,
  sync_origin: 'square' as const,
  unit_id: 'unit-1',
  warehouse_id: 'warehouse-1',
};

describe('Square catalog link observability', () => {
  it('pairs a Square variation with the visible local product name', () => {
    expect(
      mapSquareCatalogLinkObservability({
        links: [baseLink],
        productNames: new Map([['product-1', 'Tuturuuu poster']]),
      })
    ).toEqual([
      expect.objectContaining({
        productName: 'Tuturuuu poster',
        squareItemName: 'Square poster',
        squareVariationId: 'square-variation-1',
        status: 'active',
        syncOrigin: 'square',
      }),
    ]);
  });

  it('falls back to the Square name when the local product was removed', () => {
    expect(
      mapSquareCatalogLinkObservability({
        links: [{ ...baseLink, status: 'remote_deleted' }],
        productNames: new Map(),
      })[0]?.productName
    ).toBe('Square poster');
  });

  it('preserves conflict and error evidence for the operator', () => {
    expect(
      mapSquareCatalogLinkObservability({
        links: [
          {
            ...baseLink,
            last_error: 'Both sides changed',
            status: 'conflict',
          },
        ],
        productNames: new Map(),
      })[0]
    ).toMatchObject({
      lastError: 'Both sides changed',
      status: 'conflict',
    });
  });
});
