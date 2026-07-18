import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';

export type InventorySaleDateGroup = {
  date: Date | null;
  key: string;
  rows: InventorySaleSummary[];
};

export function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function groupInventorySalesByDate(rows: InventorySaleSummary[]) {
  const groups = new Map<string, InventorySaleDateGroup>();

  for (const row of rows) {
    const rawDate = row.completed_at ?? row.created_at;
    const date = rawDate ? new Date(rawDate) : null;
    const validDate = date && !Number.isNaN(date.getTime()) ? date : null;
    const key = validDate ? localDateKey(validDate) : 'undated';
    const group = groups.get(key) ?? { date: validDate, key, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  return [...groups.values()];
}
