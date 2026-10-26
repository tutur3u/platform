/**
 * Provider costs are recorded in USD, because that is what the model vendors
 * bill in. Teams do not read them in USD — a Vietnamese operator looking at
 * "$0.0042" has to do arithmetic before the number means anything.
 *
 * So the studio converts for *display* only. Nothing stored or billed changes;
 * the underlying figure stays USD, which keeps historical rows comparable and
 * avoids baking a rate into the ledger.
 */
export type DisplayCurrency = {
  code: string;
  /** USD → code. Exactly 1 when the display currency is USD. */
  rate: number;
};

export const DEFAULT_DISPLAY_CURRENCY = 'USD';

/**
 * The currencies the studio offers. Kept to the ones the platform actually holds
 * rates for, so the picker cannot offer something that silently falls back.
 */
export const SUPPORTED_DISPLAY_CURRENCIES = [
  'USD',
  'VND',
  'EUR',
  'GBP',
  'JPY',
  'SGD',
  'AUD',
] as const;

export function normalizeDisplayCurrency(value: string | undefined | null) {
  const code = value?.trim().toUpperCase();
  if (!code) return DEFAULT_DISPLAY_CURRENCY;
  return (
    SUPPORTED_DISPLAY_CURRENCIES.find((entry) => entry === code) ??
    DEFAULT_DISPLAY_CURRENCY
  );
}
