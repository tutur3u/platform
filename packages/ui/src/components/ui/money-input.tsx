'use client';

import { getCurrencyLocale } from '@tuturuuu/utils/format';
import {
  getCurrencyFractionDigits,
  majorToMinor,
  minorToMajor,
} from '@tuturuuu/utils/money';
import { useMemo } from 'react';
import { CurrencyInput, type CurrencyInputProps } from './currency-input';

export interface MoneyInputProps
  extends Omit<
    CurrencyInputProps,
    'value' | 'onChange' | 'locale' | 'maximumFractionDigits' | 'currencySuffix'
  > {
  /** ISO currency code (e.g. 'USD', 'VND'). Drives precision + locale. */
  currency: string;
  /** Amount in integer minor units (cents for USD, whole units for JPY/VND). */
  value: number | undefined;
  /** Emits the amount in integer minor units. */
  onChange: (minorValue: number) => void;
  /** Show the currency code as a muted suffix (defaults to true). */
  showCurrencySuffix?: boolean;
}

/**
 * Currency-aware money input. The `value`/`onChange` boundary is always in
 * integer **minor units** (the canonical storage format); the field renders and
 * edits in localized major units with the correct precision for the currency.
 *
 * Wraps the shared {@link CurrencyInput} so all money entry across the platform
 * shares one polished input (cursor preservation, quick-action helpers) while
 * keeping the minor-unit conversion centralized in one place.
 */
export function MoneyInput({
  currency,
  value,
  onChange,
  showCurrencySuffix = true,
  ...props
}: MoneyInputProps) {
  const fractionDigits = useMemo(
    () => getCurrencyFractionDigits(currency),
    [currency]
  );
  const locale = useMemo(() => getCurrencyLocale(currency), [currency]);
  const majorValue = useMemo(
    () => (value === undefined ? undefined : minorToMajor(value, currency)),
    [currency, value]
  );

  return (
    <CurrencyInput
      {...props}
      value={majorValue}
      onChange={(major) => onChange(majorToMinor(major, currency))}
      locale={locale}
      maximumFractionDigits={fractionDigits}
      currencySuffix={showCurrencySuffix ? currency.toUpperCase() : undefined}
    />
  );
}
