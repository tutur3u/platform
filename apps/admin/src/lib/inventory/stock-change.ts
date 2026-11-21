export type StockAmount = number | null | undefined;

export const getStockChangeAmount = (
  previous: StockAmount,
  next: StockAmount
): number | null => {
  const prev = previous ?? null;
  const nxt = next ?? null;

  if (prev == null && nxt == null) return null;

  if (prev == null) {
    return nxt === 0 ? null : nxt;
  }

  if (nxt == null) {
    return prev === 0 ? null : -prev;
  }

  const diff = nxt - prev;
  return diff === 0 ? null : diff;
};
