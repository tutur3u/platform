import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';
import { describe, expect, it } from 'vitest';
import { groupInventorySalesByDate, localDateKey } from './sale-date-groups';

function sale(id: string, createdAt: string | null): InventorySaleSummary {
  return {
    completed_at: null,
    created_at: createdAt,
    customer_name: null,
    id,
    items_count: 1,
    paid_amount: 10,
    source: 'finance_invoice',
    total_quantity: 1,
  };
}

describe('inventory sale date groups', () => {
  it('groups adjacent sales by their local calendar date', () => {
    const firstDate = new Date(2026, 6, 18, 9, 30);
    const secondDate = new Date(2026, 6, 17, 18, 45);
    const groups = groupInventorySalesByDate([
      sale('sale-1', firstDate.toISOString()),
      sale('sale-2', new Date(2026, 6, 18, 21).toISOString()),
      sale('sale-3', secondDate.toISOString()),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      localDateKey(firstDate),
      localDateKey(secondDate),
    ]);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(['sale-1', 'sale-2']);
  });

  it('keeps invalid or missing timestamps in an undated group', () => {
    const groups = groupInventorySalesByDate([
      sale('missing', null),
      sale('invalid', 'not-a-date'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('undated');
    expect(groups[0]?.date).toBeNull();
    expect(groups[0]?.rows.map((row) => row.id)).toEqual([
      'missing',
      'invalid',
    ]);
  });
});
