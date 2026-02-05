export interface ExchangeRate {
  base_currency: string;
  target_currency: string;
  rate: number;
  date: string;
}

/**
 * Convert an amount from one currency to another using USD-based exchange rates.
 *
 * @param amount - The amount to convert
 * @param fromCurrency - Source currency code (e.g., 'EUR')
 * @param toCurrency - Target currency code (e.g., 'VND')
 * @param rates - Array of USD-based exchange rates
 * @returns The converted amount, or null if conversion is not possible
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: ExchangeRate[]
): number | null {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) return amount;

  // Find USD -> from and USD -> to rates
  const fromRate =
    from === 'USD'
      ? 1
      : (rates.find(
          (r) =>
            r.base_currency === 'USD' &&
            r.target_currency.toUpperCase() === from
        )?.rate ?? null);

  const toRate =
    to === 'USD'
      ? 1
      : (rates.find(
          (r) =>
            r.base_currency === 'USD' && r.target_currency.toUpperCase() === to
        )?.rate ?? null);

  if (fromRate === null || toRate === null || fromRate === 0) return null;

  return amount * (toRate / fromRate);
}
