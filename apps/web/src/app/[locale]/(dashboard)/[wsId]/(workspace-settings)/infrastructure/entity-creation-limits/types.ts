export type WorkspaceProductTier = 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE';

export type LimitRow = {
  table_name: string;
  tier: WorkspaceProductTier;
  enabled: boolean;
  per_hour: number | null;
  per_day: number | null;
  per_week: number | null;
  per_month: number | null;
  total_limit: number | null;
  notes: string | null;
  updated_at: string;
};

export type AvailableTableRow = {
  table_name: string;
};

export type TableGroup = {
  tableName: string;
  metadata: LimitRow;
  tiers: LimitRow[];
};

export const TIER_ORDER: WorkspaceProductTier[] = [
  'FREE',
  'PLUS',
  'PRO',
  'ENTERPRISE',
];

export function buildTableGroups(rows: LimitRow[]): TableGroup[] {
  const groupedRows = new Map<string, LimitRow[]>();

  for (const row of rows) {
    const currentRows = groupedRows.get(row.table_name) ?? [];
    currentRows.push(row);
    groupedRows.set(row.table_name, currentRows);
  }

  return [...groupedRows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tableName, groupRows]) => {
      const metadata = groupRows[0];

      if (!metadata) {
        return null;
      }

      return {
        tableName,
        metadata,
        tiers: TIER_ORDER.map(
          (tier) => groupRows.find((row) => row.tier === tier) ?? null
        ).filter((row): row is LimitRow => row !== null),
      };
    })
    .filter((group): group is TableGroup => group !== null);
}

export function getLimitInputValue(value: number | null) {
  return value == null ? '' : String(value);
}
