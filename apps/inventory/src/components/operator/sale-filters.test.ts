import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import { filterAndSortInventorySales } from './sale-filters';

const sales: InventorySaleSummary[] = [
  {
    category_name: 'Convention',
    completed_at: '2026-07-18T10:00:00.000Z',
    created_at: '2026-07-18T09:00:00.000Z',
    creator_name: 'Fen',
    customer_name: null,
    id: 'sale-new',
    items_count: 1,
    notice: 'Charm order',
    paid_amount: 8.1,
    source: 'finance_invoice',
    total_quantity: 1,
  },
  {
    category_name: 'Online',
    completed_at: '2026-07-17T10:00:00.000Z',
    created_at: '2026-07-17T09:00:00.000Z',
    creator_name: 'Shen',
    customer_name: 'Mai',
    id: 'sale-old',
    items_count: 2,
    notice: 'Sticker order',
    paid_amount: 20.25,
    source: 'checkout_session',
    total_quantity: 4,
  },
];

describe('filterAndSortInventorySales', () => {
  it('combines creator, category, search, and warehouse filters', () => {
    const result = filterAndSortInventorySales({
      categoryName: 'Convention',
      creator: 'Fen',
      query: 'charm',
      rows: sales,
      sort: 'date-desc',
      warehouseId: 'warehouse-1',
      warehouseMatches: new Set(['finance_invoice:sale-new']),
    });

    expect(result.map((sale) => sale.id)).toEqual(['sale-new']);
  });

  it('sorts exact cent-level totals and quantities without mutating input', () => {
    const byAmount = filterAndSortInventorySales({
      creator: '',
      query: '',
      rows: sales,
      sort: 'amount-desc',
      warehouseId: '',
    });
    const byQuantity = filterAndSortInventorySales({
      creator: '',
      query: '',
      rows: sales,
      sort: 'quantity-desc',
      warehouseId: '',
    });

    expect(byAmount.map((sale) => sale.id)).toEqual(['sale-old', 'sale-new']);
    expect(byQuantity.map((sale) => sale.id)).toEqual(['sale-old', 'sale-new']);
    expect(sales.map((sale) => sale.id)).toEqual(['sale-new', 'sale-old']);
  });
});
