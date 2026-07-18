import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';

export function filterAndSortInventorySales({
  categoryName,
  creator,
  query,
  rows,
  sort,
  warehouseId,
  warehouseMatches,
}: {
  categoryName?: string;
  creator: string;
  query: string;
  rows: InventorySaleSummary[];
  sort: string;
  warehouseId: string;
  warehouseMatches?: Set<string>;
}) {
  const needle = query.trim().toLowerCase();
  return rows
    .filter((row) => {
      if (
        needle &&
        ![
          row.creator_name,
          row.customer_name,
          row.id,
          row.notice,
          row.owners?.join(' '),
          row.completed_at,
          row.created_at,
          String(row.paid_amount),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      ) {
        return false;
      }
      if (creator && row.creator_name?.trim() !== creator) return false;
      if (categoryName && row.category_name !== categoryName) return false;
      if (
        warehouseId &&
        warehouseMatches &&
        !warehouseMatches.has(`${row.source}:${row.id}`)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const direction = sort.endsWith('-asc') ? 1 : -1;
      if (sort.startsWith('amount-')) {
        return direction * (a.paid_amount - b.paid_amount);
      }
      if (sort.startsWith('quantity-')) {
        return direction * (a.total_quantity - b.total_quantity);
      }
      const aDate = Date.parse(a.completed_at ?? a.created_at ?? '') || 0;
      const bDate = Date.parse(b.completed_at ?? b.created_at ?? '') || 0;
      return direction * (aDate - bDate);
    });
}
