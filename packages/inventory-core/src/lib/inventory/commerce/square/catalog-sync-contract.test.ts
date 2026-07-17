import { describe, expect, it } from 'vitest';
import {
  buildSquarePhysicalCountChanges,
  decideSquareCatalogSync,
  describeSquareSyncError,
  hasSquareDeleteInstruction,
  inventoryPriceToSquareAmount,
  mergeSquareItemWithoutDeleting,
  resolveSquareInventoryPrice,
  resolveSquareWholeUnitStock,
  selectUnlinkedSquareImportProduct,
  squareAmountToInventoryPrice,
  squareSyncHash,
} from './catalog-sync-contract';

describe('Square catalog sync contract', () => {
  it('produces stable hashes regardless of object key order', () => {
    expect(squareSyncHash({ a: 1, b: 2 })).toBe(squareSyncHash({ b: 2, a: 1 }));
  });

  it.each([
    ['from_square', 'pull'],
    ['to_square', 'push'],
  ] as const)('honors explicit %s sync direction', (direction, expected) => {
    expect(
      decideSquareCatalogSync({
        currentLocalHash: 'local-new',
        currentSquareHash: 'square-new',
        direction,
        previousLocalHash: 'local-old',
        previousSquareHash: 'square-old',
      })
    ).toBe(expected);
  });

  it('pulls an unlinked Square variation during first bidirectional sync', () => {
    expect(
      decideSquareCatalogSync({
        currentLocalHash: 'local',
        currentSquareHash: 'square',
        direction: 'bidirectional',
      })
    ).toBe('pull');
  });

  it('detects two-sided edits instead of overwriting either side', () => {
    expect(
      decideSquareCatalogSync({
        currentLocalHash: 'local-new',
        currentSquareHash: 'square-new',
        direction: 'bidirectional',
        previousLocalHash: 'local-old',
        previousSquareHash: 'square-old',
      })
    ).toBe('conflict');
  });

  it('pushes local-only changes and pulls Square-only changes', () => {
    expect(
      decideSquareCatalogSync({
        currentLocalHash: 'local-new',
        currentSquareHash: 'square-old',
        direction: 'bidirectional',
        previousLocalHash: 'local-old',
        previousSquareHash: 'square-old',
      })
    ).toBe('push');
    expect(
      decideSquareCatalogSync({
        currentLocalHash: 'local-old',
        currentSquareHash: 'square-new',
        direction: 'bidirectional',
        previousLocalHash: 'local-old',
        previousSquareHash: 'square-old',
      })
    ).toBe('pull');
  });

  it.each([
    ['USD', 20, 2000],
    ['JPY', 500, 500],
    ['BHD', 1.234, 1234],
  ] as const)(
    'converts %s catalog prices between Inventory major units and Square minor units',
    (currency, major, minor) => {
      expect(inventoryPriceToSquareAmount(major, currency)).toBe(minor);
      expect(squareAmountToInventoryPrice(minor, currency)).toBe(major);
    }
  );

  it('clamps invalid negative catalog prices at the provider boundary', () => {
    expect(inventoryPriceToSquareAmount(-1, 'USD')).toBe(0);
    expect(squareAmountToInventoryPrice(-100, 'USD')).toBe(0);
  });

  it('preserves whole-unit stock without modification', () => {
    expect(
      resolveSquareWholeUnitStock({ currentAmount: 4, remoteAmount: 12 })
    ).toEqual({ amount: 12, error: null });
  });

  it('keeps existing stock for fractional Square counts and requests review', () => {
    expect(
      resolveSquareWholeUnitStock({ currentAmount: 4, remoteAmount: 13.51 })
    ).toEqual({
      amount: 4,
      error:
        'Square reported non-whole stock (13.51). Tuturuuu kept its value until an operator reviews the count.',
    });
  });

  it('fails closed at zero for a new fractional Square stock row', () => {
    expect(
      resolveSquareWholeUnitStock({ currentAmount: null, remoteAmount: 0.5 })
    ).toEqual({
      amount: 0,
      error:
        'Square reported non-whole stock (0.5). Tuturuuu set it to 0 until an operator reviews the count.',
    });
  });

  it('preserves an exact whole-unit Square price', () => {
    expect(
      resolveSquareInventoryPrice({
        centLevelPricesReady: false,
        currency: 'USD',
        currentPrice: 20,
        remoteAmountMinor: 2500,
      })
    ).toEqual({ error: null, price: 25 });
  });

  it('preserves USD cents from Square in the inventory price', () => {
    expect(
      resolveSquareInventoryPrice({
        centLevelPricesReady: true,
        currency: 'USD',
        currentPrice: 12,
        remoteAmountMinor: 1351,
      })
    ).toEqual({ error: null, price: 13.51 });
  });

  it('preserves three-decimal currency prices from Square', () => {
    expect(
      resolveSquareInventoryPrice({
        centLevelPricesReady: true,
        currency: 'BHD',
        currentPrice: null,
        remoteAmountMinor: 1234,
      })
    ).toEqual({ error: null, price: 1.234 });
  });

  it('holds fractional prices until the database confirms decimal storage', () => {
    expect(
      resolveSquareInventoryPrice({
        centLevelPricesReady: false,
        currency: 'USD',
        currentPrice: 12,
        remoteAmountMinor: 1351,
      })
    ).toEqual({
      error:
        'Square reported a non-whole USD price (13.51). Tuturuuu kept its value until an operator reviews the price.',
      price: 12,
    });
  });

  it('extracts provider and database messages for private sync observability', () => {
    expect(describeSquareSyncError({ message: 'Invalid provider value' })).toBe(
      'Invalid provider value'
    );
    expect(describeSquareSyncError({ code: 'UNKNOWN' })).toBe(
      'Square sync failed'
    );
  });

  it('reuses only an unlinked prior Square import', () => {
    expect(
      selectUnlinkedSquareImportProduct({
        candidateIds: ['linked-product', 'orphan-product'],
        linkedProductIds: ['linked-product'],
      })
    ).toBe('orphan-product');
    expect(
      selectUnlinkedSquareImportProduct({
        candidateIds: ['linked-product'],
        linkedProductIds: ['linked-product'],
      })
    ).toBeNull();
  });

  it('keeps unknown remote variations when updating a linked item', () => {
    const result = mergeSquareItemWithoutDeleting({
      itemId: 'item-1',
      itemVersion: 7,
      name: 'Local name',
      remoteItem: {
        id: 'item-1',
        item_data: {
          name: 'Remote name',
          variations: [
            {
              id: 'known-variation',
              item_variation_data: { name: 'Known' },
              type: 'ITEM_VARIATION',
              version: 3,
            },
            {
              id: 'remote-only-variation',
              item_variation_data: { name: 'Remote only' },
              type: 'ITEM_VARIATION',
              version: 4,
            },
          ],
        },
        type: 'ITEM',
        version: 7,
      },
      variations: [
        {
          amount: 4,
          localHash: 'hash',
          priceMajor: 1.25,
          sku: 'SKU-1',
          squareVariationId: 'known-variation',
          squareVariationVersion: 3,
          tempId: '#unused',
          unitName: 'Updated known',
        },
      ],
    });

    expect(result.item_data?.variations).toHaveLength(2);
    expect(
      result.item_data?.variations?.find(
        (variation) => variation.id === 'known-variation'
      )
    ).toMatchObject({
      item_variation_data: {
        price_money: { amount: 125, currency: 'USD' },
      },
    });
    expect(
      result.item_data?.variations?.find(
        (variation) => variation.id === 'remote-only-variation'
      )
    ).toMatchObject({ item_variation_data: { name: 'Remote only' } });
    expect(hasSquareDeleteInstruction(result)).toBe(false);
  });

  it('adds new variations without emitting deletion flags', () => {
    const result = mergeSquareItemWithoutDeleting({
      itemId: '#item',
      name: 'New item',
      variations: [
        {
          amount: 1,
          localHash: 'hash',
          priceMajor: 1,
          sku: 'SKU-NEW',
          tempId: '#variation',
          unitName: 'Default',
        },
      ],
    });

    expect(result.item_data?.variations).toHaveLength(1);
    expect(result.item_data?.variations?.[0]).toMatchObject({
      item_variation_data: {
        price_money: { amount: 100, currency: 'USD' },
      },
    });
    expect(hasSquareDeleteInstruction(result)).toBe(false);
  });

  it('allows non-deleted metadata but rejects provider deletion instructions', () => {
    expect(hasSquareDeleteInstruction({ is_deleted: false })).toBe(false);
    expect(hasSquareDeleteInstruction({ is_deleted: true })).toBe(true);
    expect(hasSquareDeleteInstruction({ type: 'DELETE_VARIATION' })).toBe(true);
  });

  it('builds only non-negative physical counts and skips unlimited stock', () => {
    const changes = buildSquarePhysicalCountChanges({
      locationId: 'location-1',
      occurredAt: '2026-07-13T08:00:00.000Z',
      variations: [
        {
          amount: -5,
          referenceId: 'stock-1',
          squareVariationId: 'variation-1',
        },
        {
          amount: null,
          referenceId: 'stock-2',
          squareVariationId: 'variation-2',
        },
      ],
    });

    expect(changes).toEqual([
      {
        physical_count: expect.objectContaining({
          catalog_object_id: 'variation-1',
          quantity: '0',
        }),
        type: 'PHYSICAL_COUNT',
      },
    ]);
    expect(hasSquareDeleteInstruction(changes)).toBe(false);
  });
});
