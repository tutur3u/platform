import { describe, expect, it } from 'vitest';
import { filterInventoryProducts } from './product-filters';

describe('filterInventoryProducts', () => {
  it('combines owner and warehouse filters across stock rows', () => {
    const result = filterInventoryProducts(
      [
        {
          id: 'matching',
          inventory: [
            { warehouse_id: 'back-room' },
            { warehouse_id: 'front-counter' },
          ],
          name: 'Charm',
          owner_id: 'fen',
        },
        {
          id: 'wrong-owner',
          inventory: [{ warehouse_id: 'front-counter' }],
          name: 'Sticker',
          owner_id: 'shen',
        },
      ],
      { ownerId: 'fen', warehouseId: 'front-counter' }
    );

    expect(result.map((product) => product.id)).toEqual(['matching']);
  });
});
