import type {
  InventoryFinanceCurrencyAmount,
  InventoryFinanceEntryKind,
  InventoryFinanceProvider,
  InventoryFinanceReconciliationSummary,
} from '@tuturuuu/internal-api/finance-reconciliation';
import {
  addMoney,
  type Money,
  minorUnitsSchema,
  moneyToMajor,
  parseMoneyFromMinor,
} from '@tuturuuu/utils/finance-money';
import { z } from 'zod';

export const providerSchema = z.enum([
  'cash',
  'polar',
  'square_pos',
  'square_terminal',
]);
export const externalProviderSchema = z.enum([
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

type CurrencyTotal = { money: Money; count: number };

const summaryMinorSchema = z
  .union([z.number(), z.string().trim().min(1).transform(Number)])
  .pipe(minorUnitsSchema);
const summaryCountSchema = z.number().int().nonnegative();

function addAmount(
  previous: CurrencyTotal | undefined,
  money: Money,
  count: number
): CurrencyTotal {
  const totalCount = (previous?.count ?? 0) + count;
  if (!Number.isSafeInteger(totalCount))
    throw new RangeError('Summary count exceeds safe integer range');
  return {
    money: previous ? addMoney(previous.money, money) : money,
    count: totalCount,
  };
}

function values(
  map: Map<string, CurrencyTotal>
): InventoryFinanceCurrencyAmount[] {
  return [...map.values()]
    .map(({ money, count }) => ({
      amount: moneyToMajor(money),
      amountMinor: money.minorUnits,
      currency: money.currency,
      count,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

type SummaryMaps = {
  chargebackHolds: Map<string, CurrencyTotal>;
  chargebackReleases: Map<string, CurrencyTotal>;
  grossSales: Map<string, CurrencyTotal>;
  netSales: Map<string, CurrencyTotal>;
  refunds: Map<string, CurrencyTotal>;
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

function rowTargets(maps: SummaryMaps, kind: InventoryFinanceEntryKind) {
  const targets = [maps.netSales];
  if (kind === 'sale') targets.push(maps.grossSales);
  if (kind === 'refund') targets.push(maps.refunds);
  if (kind === 'chargeback_hold') targets.push(maps.chargebackHolds);
  if (kind === 'chargeback_release') {
    targets.push(maps.chargebackReleases);
  }
  return targets;
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
  const pending = new Map<string, CurrencyTotal>();
  const providers = new Map<InventoryFinanceProvider, SummaryMaps>();
  let skippedRows = 0;

  for (const row of rows) {
    const provider = providerSchema.safeParse(row.provider);
    const kind = entryKindSchema.safeParse(row.kind);
    if (!provider.success || !kind.success) continue;
    try {
      const money = parseMoneyFromMinor(
        summaryMinorSchema.parse(row.amount_minor),
        row.currency
      );
      const count = summaryCountSchema.parse(Number(row.entry_count ?? 0));
      const providerMaps = providers.get(provider.data) ?? createSummaryMaps();
      const targets = [
        ...rowTargets(totals, kind.data),
        ...rowTargets(providerMaps, kind.data),
      ];
      if (row.status === 'pending' || row.status === 'error')
        targets.push(pending);
      // Validate every affected bucket before committing any part of this row.
      const updates = targets.map(
        (target) =>
          [target, addAmount(target.get(money.currency), money, count)] as const
      );
      for (const [target, value] of updates) target.set(money.currency, value);
      providers.set(provider.data, providerMaps);
    } catch (error) {
      if (!(error instanceof z.ZodError || error instanceof RangeError))
        throw error;
      skippedRows += 1;
    }
  }
  if (skippedRows > 0) {
    console.warn('Skipped invalid Inventory Finance reconciliation rows', {
      skippedRows,
    });
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
