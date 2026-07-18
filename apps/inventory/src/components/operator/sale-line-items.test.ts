import { describe, expect, it } from 'vitest';
import { aggregateSaleLines } from './sale-line-items';

describe('aggregateSaleLines', () => {
  it('combines repeated products and keeps their compact quantity and total', () => {
    const result = aggregateSaleLines(
      [
        {
          owner_id: null,
          owner_name: '',
          price: 8.1,
          product_id: 'product-1',
          product_name: 'Charm',
          quantity: 2,
          unit_id: 'unit-1',
          unit_name: 'Piece',
          warehouse_id: 'warehouse-1',
          warehouse_name: 'Front counter',
        },
        {
          owner_id: null,
          owner_name: '',
          price: 8.1,
          product_id: 'product-1',
          product_name: 'Charm',
          quantity: 1,
          unit_id: 'unit-1',
          unit_name: 'Piece',
          warehouse_id: 'warehouse-2',
          warehouse_name: 'Back room',
        },
      ],
      [
        {
          avatar_url: '/api/media/charm.webp',
          id: 'product-1',
          name: 'Charm',
        },
      ]
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      imageUrl: '/api/media/charm.webp',
      key: 'product-1',
      locations: ['Piece · Front counter', 'Piece · Back room'],
      productName: 'Charm',
      quantity: 3,
    });
    expect(result[0]?.total).toBeCloseTo(24.3);
  });
});
