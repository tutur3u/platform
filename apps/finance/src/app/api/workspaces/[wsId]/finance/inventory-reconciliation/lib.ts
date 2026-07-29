import type {
  InventoryFinanceCurrencyAmount,
  InventoryFinanceEntryKind,
  InventoryFinanceProvider,
  InventoryFinanceReconciliationSummary,
} from '@tuturuuu/internal-api/finance-reconciliation';
import { z } from 'zod';

export const providerSchema = z.enum([
  'polar',
  'square_pos',
  'square_terminal',
]);
export const entryKindSchema = z.enum([
  'sale',
  'refund',
  'chargeback_hold',
  'chargeback_release',
  'manual_provider_adjustment',
]);
export const entryStatusSchema = z.enum(['pending', 'linked', 'error']);
export const currencySchema = z
  .string()
  .trim()
  .min(3)
  .max(3)
  .transform((value) => value.toUpperCase());

const cursorSchema = z.object({
  id: z.guid(),
  occurredAt: z.iso.datetime({ offset: true }),
});

export type ReconciliationCursor = z.infer<typeof cursorSchema>;

export function decodeReconciliationCursor(
  cursor: string | null
): ReconciliationCursor | null {
  if (!cursor) return null;
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    );
  } catch {
    return null;
  }
}

export function encodeReconciliationCursor(cursor: ReconciliationCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export type SummaryRow = {
  amount: number | string | null;
  amount_minor: number | string | null;
  currency: string;
  entry_count: number | string | null;
  kind: string;
  provider: string;
  status: string;
};

function addAmount(
  target: Map<string, InventoryFinanceCurrencyAmount>,
  row: SummaryRow
) {
  const previous = target.get(row.currency);
  const amount = Number(row.amount ?? 0);
  const amountMinor = Number(row.amount_minor ?? 0);
  const count = Number(row.entry_count ?? 0);
  target.set(row.currency, {
    amount: (previous?.amount ?? 0) + amount,
    amountMinor: (previous?.amountMinor ?? 0) + amountMinor,
    count: (previous?.count ?? 0) + count,
    currency: row.currency,
  });
}

function values(map: Map<string, InventoryFinanceCurrencyAmount>) {
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

type SummaryMaps = {
  chargebackHolds: Map<string, InventoryFinanceCurrencyAmount>;
  chargebackReleases: Map<string, InventoryFinanceCurrencyAmount>;
  grossSales: Map<string, InventoryFinanceCurrencyAmount>;
  netSales: Map<string, InventoryFinanceCurrencyAmount>;
  refunds: Map<string, InventoryFinanceCurrencyAmount>;
};

function createSummaryMaps(): SummaryMaps {
  return {
    chargebackHolds: new Map(),
    chargebackReleases: new Map(),
    grossSales: new Map(),
    netSales: new Map(),
    refunds: new Map(),
  };
}

function addRow(maps: SummaryMaps, row: SummaryRow) {
  addAmount(maps.netSales, row);
  if (row.kind === 'sale') addAmount(maps.grossSales, row);
  if (row.kind === 'refund') addAmount(maps.refunds, row);
  if (row.kind === 'chargeback_hold') addAmount(maps.chargebackHolds, row);
  if (row.kind === 'chargeback_release') {
    addAmount(maps.chargebackReleases, row);
  }
}

function serializeMaps(maps: SummaryMaps) {
  return {
    chargebackHolds: values(maps.chargebackHolds),
    chargebackReleases: values(maps.chargebackReleases),
    grossSales: values(maps.grossSales),
    netSales: values(maps.netSales),
    refunds: values(maps.refunds),
  };
}

export function buildReconciliationSummary(
  rows: SummaryRow[]
): InventoryFinanceReconciliationSummary {
  const totals = createSummaryMaps();
  const pending = new Map<string, InventoryFinanceCurrencyAmount>();
  const providers = new Map<InventoryFinanceProvider, SummaryMaps>();

  for (const row of rows) {
    const provider = providerSchema.safeParse(row.provider);
    const kind = entryKindSchema.safeParse(row.kind);
    if (!provider.success || !kind.success) continue;
    addRow(totals, row);
    if (row.status === 'pending' || row.status === 'error') {
      addAmount(pending, row);
    }
    const providerMaps = providers.get(provider.data) ?? createSummaryMaps();
    addRow(providerMaps, row);
    providers.set(provider.data, providerMaps);
  }

  return {
    ...serializeMaps(totals),
    pending: values(pending),
    providers: [...providers.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, maps]) => ({ provider, ...serializeMaps(maps) })),
  };
}

export function inventorySource({
  checkoutId,
  entryId,
  kind,
  provider,
  providerReferenceId,
  wsId,
}: {
  checkoutId: string | null;
  entryId: string;
  kind: InventoryFinanceEntryKind;
  provider: InventoryFinanceProvider;
  providerReferenceId: string;
  wsId: string;
}) {
  const inventoryOrigin =
    process.env.NODE_ENV === 'production'
      ? 'https://inventory.tuturuuu.com'
      : 'https://inventory.tuturuuu.localhost';
  return {
    checkoutId,
    entryId,
    inventoryHref: checkoutId
      ? `${inventoryOrigin}/${wsId}/sales?checkoutId=${checkoutId}`
      : `${inventoryOrigin}/${wsId}/sales`,
    kind,
    provider,
    providerReferenceId,
    reconciliationHref: `/${wsId}/transactions?reconciliation=${entryId}`,
  };
}
