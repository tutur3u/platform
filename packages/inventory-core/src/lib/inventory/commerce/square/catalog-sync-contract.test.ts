import { describe, expect, it } from 'vitest';
import {
  buildSquarePhysicalCountChanges,
  decideSquareCatalogSync,
  hasSquareDeleteInstruction,
  mergeSquareItemWithoutDeleting,
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
          price: 125,
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
          price: 100,
          sku: 'SKU-NEW',
          tempId: '#variation',
          unitName: 'Default',
        },
      ],
    });

    expect(result.item_data?.variations).toHaveLength(1);
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
