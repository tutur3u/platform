'use client';

import { Input } from '@tuturuuu/ui/input';
import { useEffect, useMemo, useState } from 'react';
import {
  getInventoryCurrencyFractionDigits,
  getInventoryCurrencyLocale,
  normalizeInventoryPrice,
} from './currency';

function getCurrencySeparators(locale: string) {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);

  return {
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
  };
}

function formatDisplayValue(value: number, currency: string): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  const locale = getInventoryCurrencyLocale(currency);
  const fractionDigits = getInventoryCurrencyFractionDigits(currency);

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
    useGrouping: true,
  }).format(normalizeInventoryPrice(value, currency));
}

function formatEditingValue(value: number, currency: string): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  const fractionDigits = getInventoryCurrencyFractionDigits(currency);
  const normalizedValue = normalizeInventoryPrice(value, currency);

  if (fractionDigits === 0) {
    return String(Math.trunc(normalizedValue));
  }

  return normalizedValue.toFixed(fractionDigits).replace(/\.?0+$/, '');
}

function parsePriceInput(rawValue: string, currency: string): number {
  if (!rawValue.trim()) {
    return 0;
  }

  const locale = getInventoryCurrencyLocale(currency);
  const fractionDigits = getInventoryCurrencyFractionDigits(currency);
  const { decimal, group } = getCurrencySeparators(locale);

  let sanitized = rawValue.replaceAll(group, '').replace(/\s+/g, '');

  if (decimal !== '.') {
    sanitized = sanitized.replaceAll(decimal, '.');
  }

  if (fractionDigits === 0) {
    sanitized = sanitized.replace(/[^\d]/g, '');
  } else {
    sanitized = sanitized.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
  }

  const parsed = Number.parseFloat(sanitized);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return normalizeInventoryPrice(parsed, currency);
}

interface InventoryPriceInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'onChange' | 'type' | 'value'
  > {
  currency: string;
  value: number;
  onChange: (value: number) => void;
}

export function InventoryPriceInput({
  currency,
  value,
  onChange,
  onBlur,
  onFocus,
  ...props
}: InventoryPriceInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState('');

  const formattedDisplayValue = useMemo(
    () => formatDisplayValue(value, currency),
    [currency, value]
  );

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formattedDisplayValue);
    }
  }, [formattedDisplayValue, isFocused]);

  return (
    <Input
      {...props}
      type="text"
      inputMode={
        getInventoryCurrencyFractionDigits(currency) === 0
          ? 'numeric'
          : 'decimal'
      }
      value={displayValue}
      onFocus={(event) => {
        setIsFocused(true);
        setDisplayValue(formatEditingValue(value, currency));
        onFocus?.(event);
      }}
      onBlur={(event) => {
        const parsedValue = parsePriceInput(displayValue, currency);
        onChange(parsedValue);
        setDisplayValue(formatDisplayValue(parsedValue, currency));
        setIsFocused(false);
        onBlur?.(event);
      }}
      onChange={(event) => {
        const nextDisplayValue = event.target.value;
        setDisplayValue(nextDisplayValue);
        onChange(parsePriceInput(nextDisplayValue, currency));
      }}
    />
  );
}
