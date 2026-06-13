export const UNLIMITED_STOCK_SYMBOL = '∞';

type StockValue = number | null | undefined;

export type InventoryStockState = {
  amount: number;
  displayAmount: string;
  isLowStock: boolean;
  isUnlimited: boolean;
  minAmount: number;
};

export function getInventoryStockState({
  amount,
  minAmount,
}: {
  amount: StockValue;
  minAmount: unknown;
}): InventoryStockState {
  const isUnlimited = amount === null;
  const numericAmount = isUnlimited ? 0 : numberOrZero(amount);
  const numericMinAmount = numberOrZero(minAmount);

  return {
    amount: numericAmount,
    displayAmount: isUnlimited ? UNLIMITED_STOCK_SYMBOL : String(numericAmount),
    isLowStock: !isUnlimited && numericAmount <= numericMinAmount,
    isUnlimited,
    minAmount: numericMinAmount,
  };
}

export function formatInventoryQuantity(value: StockValue) {
  return value === null ? UNLIMITED_STOCK_SYMBOL : String(numberOrZero(value));
}

export function stockAmountFromRecords(
  ...records: Array<Record<string, unknown> | undefined>
): StockValue {
  for (const record of records) {
    if (!record || !Object.hasOwn(record, 'amount')) continue;

    const value = record.amount;
    if (value === null) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return undefined;
}

export function numberOrZero(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}
