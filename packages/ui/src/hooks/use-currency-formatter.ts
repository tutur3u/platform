import { useCallback, useMemo } from 'react';

interface UseCurrencyFormatterOptions {
  currency: string;
  maximumFractionDigits?: number;
}

/**
 * Hook for consistent currency formatting across finance components.
 * Automatically determines locale based on currency code.
 */
export function useCurrencyFormatter({
  currency,
  maximumFractionDigits = 0,
}: UseCurrencyFormatterOptions) {
  const locale = useMemo(() => {
    // Map currency codes to appropriate locales
    switch (currency?.toUpperCase()) {
      case 'VND':
        return 'vi-VN';
      case 'JPY':
        return 'ja-JP';
      case 'KRW':
        return 'ko-KR';
      case 'EUR':
        return 'de-DE';
      case 'GBP':
        return 'en-GB';
      default:
        return 'en-US';
    }
  }, [currency]);

  const formatter = useMemo(() => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits,
    });
  }, [locale, currency, maximumFractionDigits]);

  const formatCurrency = useCallback(
    (amount: number): string => {
      return formatter.format(amount);
    },
    [formatter]
  );

  const formatCompact = useCallback(
    (amount: number): string => {
      const compactFormatter = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      });
      return compactFormatter.format(amount);
    },
    [locale, currency]
  );

  const formatDate = useCallback(
    (dateStr: string, options?: Intl.DateTimeFormatOptions): string => {
      const defaultOptions: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
      };
      return new Intl.DateTimeFormat(locale, options ?? defaultOptions).format(
        new Date(dateStr)
      );
    },
    [locale]
  );

  return {
    formatCurrency,
    formatCompact,
    formatDate,
    locale,
  };
}
